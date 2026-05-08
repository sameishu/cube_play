import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const PALETTE = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA94D', '#8CE99A', '#748FFC'];
const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
const DEFAULT_DIMS = { l: 4, w: 2, h: 3 };
const ORIENTATION_TRANSFORMS = createOrientationTransforms();

const state = {
  dims: { ...DEFAULT_DIMS },
  complete: createVolume(DEFAULT_DIMS.h, DEFAULT_DIMS.w, DEFAULT_DIMS.l, true),
  pieces: [],
  addingPiece: null,
  selectedCompleteLayer: 0,
  analysisLayer: 0,
  results: null,
  arrangementSolutions: [],
  arrangementSolutionIndex: -1,
  transparencyMode: false,
  cameraMode: 'free',
  missingOnlyMode: false,
};

const runtime = {
  refs: null,
  three: null,
  sceneAnimations: [],
  numberAnimationId: null,
};

const SAMPLE_DATA = buildSamples();

mount();
runtime.refs = captureRefs();
setupEvents();
initThreeScene();
renderAll();
refreshScene();
applyCameraPreset('free', true);
setStatus('请先编辑完整体和拆分体，再点击“计算缺失体”。', 'info');

function mount() {
  document.querySelector('#app').innerHTML = `
    <div class="app">
      <aside class="left-panel">
        <section class="module module-a">
          <h2>完整堆积体定义</h2>
          <div class="dimension-row">
            <label>L
              <input id="dim-l" type="number" min="2" max="6" />
            </label>
            <label>W
              <input id="dim-w" type="number" min="2" max="6" />
            </label>
            <label>H
              <input id="dim-h" type="number" min="2" max="6" />
            </label>
          </div>
          <div id="complete-tabs" class="layer-tabs"></div>
          <div id="complete-grid" class="grid-editor"></div>
          <div class="quick-row">
            <button id="clear-complete-layer">清空本层</button>
            <button id="copy-complete-layer">复制上一层</button>
          </div>
        </section>

        <section class="module module-b">
          <div class="section-head">
            <h2>拆分堆积体管理</h2>
            <button id="add-piece-btn" class="add-piece-btn">添加拆分体</button>
          </div>
          <div id="piece-list" class="piece-list"></div>
          <div id="piece-editor" class="piece-editor hidden"></div>
        </section>

        <section class="module module-c">
          <div>
            <button id="calc-btn" class="primary-btn">计算缺失体</button>
            <div class="secondary-row">
              <button id="reset-btn" class="ghost">重置所有</button>
              <select id="sample-select">
                <option value="">加载真题示例</option>
                <option value="2019国考">2019国考</option>
                <option value="2018青海">2018青海</option>
              </select>
            </div>
          </div>
          <div id="status" class="status info"></div>
        </section>
      </aside>

      <main class="right-panel">
        <section class="viewport">
          <div class="view-buttons" id="view-buttons">
            <button data-view="front">正视图</button>
            <button data-view="top">俯视图</button>
            <button data-view="side">侧视图</button>
            <button data-view="free">自由视角</button>
          </div>
          <div class="viewport-bottom-left">
            <button id="toggle-missing-only">只显示缺失体</button>
          </div>
          <div id="scene"></div>
        </section>

        <section class="analysis-panel">
          <div class="analysis-col">
            <h3 class="analysis-title">数量计算</h3>
            <div id="formula-box" class="formula-box">点击“计算缺失体”后显示推导过程。</div>
          </div>

          <div class="analysis-col">
            <div class="layer-title-row">
              <h3 id="layer-title" class="analysis-title">第1层俯视图</h3>
              <div class="layer-arrows">
                <button id="layer-prev" title="上一层">←</button>
                <button id="layer-next" title="下一层">→</button>
              </div>
            </div>
            <div id="layer-grid" class="layer-view-grid"></div>
            <div id="layer-stats" class="layer-stats"></div>
          </div>

          <div class="analysis-col">
            <h3 class="analysis-title">操作与提示</h3>
            <div class="analysis-actions">
              <button id="play-assembly">播放拼合动画</button>
              <button id="toggle-transparent">切换透明模式</button>
              <button id="switch-solution">换一个方案</button>
            </div>
            <div id="hint-box" class="hint-box">提示：计算后会显示每层缺失位置与总量关系。</div>
          </div>
        </section>
      </main>
    </div>
  `;
}

function captureRefs() {
  return {
    dimL: document.querySelector('#dim-l'),
    dimW: document.querySelector('#dim-w'),
    dimH: document.querySelector('#dim-h'),
    completeTabs: document.querySelector('#complete-tabs'),
    completeGrid: document.querySelector('#complete-grid'),
    clearCompleteLayer: document.querySelector('#clear-complete-layer'),
    copyCompleteLayer: document.querySelector('#copy-complete-layer'),
    addPieceBtn: document.querySelector('#add-piece-btn'),
    pieceList: document.querySelector('#piece-list'),
    pieceEditor: document.querySelector('#piece-editor'),
    calcBtn: document.querySelector('#calc-btn'),
    resetBtn: document.querySelector('#reset-btn'),
    sampleSelect: document.querySelector('#sample-select'),
    status: document.querySelector('#status'),
    scene: document.querySelector('#scene'),
    viewButtons: document.querySelector('#view-buttons'),
    formulaBox: document.querySelector('#formula-box'),
    layerTitle: document.querySelector('#layer-title'),
    layerPrev: document.querySelector('#layer-prev'),
    layerNext: document.querySelector('#layer-next'),
    layerGrid: document.querySelector('#layer-grid'),
    layerStats: document.querySelector('#layer-stats'),
    playAssembly: document.querySelector('#play-assembly'),
    toggleTransparent: document.querySelector('#toggle-transparent'),
    switchSolution: document.querySelector('#switch-solution'),
    toggleMissingOnly: document.querySelector('#toggle-missing-only'),
    hintBox: document.querySelector('#hint-box'),
  };
}

function setupEvents() {
  const refs = runtime.refs;
  [refs.dimL, refs.dimW, refs.dimH].forEach((input) => {
    input.addEventListener('change', onDimensionsChange);
  });

  refs.clearCompleteLayer.addEventListener('click', () => {
    const layer = state.selectedCompleteLayer;
    state.complete[layer] = createLayer(state.dims.w, state.dims.l, false);
    invalidateResults();
    renderCompleteEditor();
    renderAnalysisPanel();
    refreshScene();
    setStatus(`已清空第${layer + 1}层。`, 'info');
  });

  refs.copyCompleteLayer.addEventListener('click', () => {
    const layer = state.selectedCompleteLayer;
    if (layer === 0) {
      setStatus('第一层没有上一层可复制。', 'error');
      return;
    }
    state.complete[layer] = cloneLayer(state.complete[layer - 1]);
    invalidateResults();
    renderCompleteEditor();
    renderAnalysisPanel();
    refreshScene();
    setStatus(`已复制第${layer}层到第${layer + 1}层。`, 'success');
  });

  refs.addPieceBtn.addEventListener('click', () => {
    if (state.addingPiece) {
      state.addingPiece = null;
      renderPieceEditor();
      return;
    }
    state.addingPiece = {
      name: `拆分体${toCircled(state.pieces.length + 1)}`,
      color: PALETTE[state.pieces.length % PALETTE.length],
      volume: createVolume(state.dims.h, state.dims.w, state.dims.l, false),
      selectedLayer: 0,
      selectedPlacementIndex: -1,
      placementCandidates: [],
    };
    renderPieceEditor();
  });

  refs.calcBtn.addEventListener('click', calculateMissing);

  refs.resetBtn.addEventListener('click', () => {
    resetToDefault();
    setStatus('已重置为默认状态。', 'info');
  });

  refs.sampleSelect.addEventListener('change', () => {
    const selected = refs.sampleSelect.value;
    if (!selected) return;
    loadSample(selected);
    refs.sampleSelect.value = '';
  });

  refs.layerPrev.addEventListener('click', () => {
    if (state.analysisLayer > 0) {
      state.analysisLayer -= 1;
      renderLayerView();
      renderHints();
    }
  });

  refs.layerNext.addEventListener('click', () => {
    if (state.analysisLayer < state.dims.h - 1) {
      state.analysisLayer += 1;
      renderLayerView();
      renderHints();
    }
  });

  refs.playAssembly.addEventListener('click', playAssemblyAnimation);

  refs.toggleTransparent.addEventListener('click', () => {
    state.transparencyMode = !state.transparencyMode;
    refs.toggleTransparent.textContent = state.transparencyMode ? '恢复实体模式' : '切换透明模式';
    refreshScene();
  });

  refs.switchSolution.addEventListener('click', switchToNextSolution);

  refs.toggleMissingOnly.addEventListener('click', () => {
    state.missingOnlyMode = !state.missingOnlyMode;
    renderMissingOnlyButton();
    refreshScene();
    if (state.missingOnlyMode && !state.results?.missingCount) {
      setStatus('当前仅显示缺失体模式已开启，请先点击“计算缺失体”。', 'info');
    }
  });

  refs.viewButtons.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-view]');
    if (!button) return;
    const mode = button.dataset.view;
    state.cameraMode = mode;
    applyCameraPreset(mode, false);
    renderViewButtons();
  });
}

function onDimensionsChange() {
  const refs = runtime.refs;
  const l = clampNumber(Number(refs.dimL.value), 2, 6);
  const w = clampNumber(Number(refs.dimW.value), 2, 6);
  const h = clampNumber(Number(refs.dimH.value), 2, 6);

  if (l * w * h > 216) {
    setStatus('最大体素数量不能超过216。', 'error');
    return;
  }

  state.dims = { l, w, h };
  state.complete = createVolume(h, w, l, true);
  state.pieces = [];
  state.addingPiece = null;
  state.selectedCompleteLayer = 0;
  state.analysisLayer = 0;
  state.results = null;
  state.arrangementSolutions = [];
  state.arrangementSolutionIndex = -1;
  state.transparencyMode = false;
  state.cameraMode = 'free';
  state.missingOnlyMode = false;
  renderAll();
  refreshScene();
  applyCameraPreset('free', true);
  setStatus('尺寸已更新，已重置到新的完整体。', 'info');
}

function resetToDefault() {
  state.dims = { ...DEFAULT_DIMS };
  state.complete = createVolume(DEFAULT_DIMS.h, DEFAULT_DIMS.w, DEFAULT_DIMS.l, true);
  state.pieces = [];
  state.addingPiece = null;
  state.selectedCompleteLayer = 0;
  state.analysisLayer = 0;
  state.results = null;
  state.arrangementSolutions = [];
  state.arrangementSolutionIndex = -1;
  state.transparencyMode = false;
  state.cameraMode = 'free';
  state.missingOnlyMode = false;
  renderAll();
  refreshScene();
  applyCameraPreset('free', true);
}

function loadSample(name) {
  const sample = SAMPLE_DATA[name];
  if (!sample) return;
  state.dims = { ...sample.dims };
  state.complete = cloneVolume(sample.complete);
  state.pieces = sample.pieces.map((piece) => ({
    name: piece.name,
    color: piece.color,
    shape: cloneVolume(piece.shape || piece.volume),
    volume: cloneVolume(piece.volume),
  }));
  state.addingPiece = null;
  state.selectedCompleteLayer = 0;
  state.analysisLayer = 0;
  state.results = null;
  state.arrangementSolutions = [];
  state.arrangementSolutionIndex = -1;
  state.transparencyMode = false;
  state.cameraMode = 'free';
  state.missingOnlyMode = false;
  renderAll();
  refreshScene();
  applyCameraPreset('free', true);
  setStatus(`已加载示例：${name}。点击“计算缺失体”查看结果。`, 'success');
}

function renderAll() {
  renderDimensionInputs();
  renderCompleteEditor();
  renderPieceList();
  renderPieceEditor();
  renderAnalysisPanel();
  renderViewButtons();
  renderMissingOnlyButton();
  updateSwitchSolutionButton();
}

function renderDimensionInputs() {
  const refs = runtime.refs;
  refs.dimL.value = String(state.dims.l);
  refs.dimW.value = String(state.dims.w);
  refs.dimH.value = String(state.dims.h);
}

function renderCompleteEditor() {
  const refs = runtime.refs;
  renderLayerTabs({
    container: refs.completeTabs,
    layers: state.dims.h,
    selectedLayer: state.selectedCompleteLayer,
    hasContent: (layer) => countLayer(state.complete[layer]) > 0,
    onClick: (layer) => {
      state.selectedCompleteLayer = layer;
      renderCompleteEditor();
    },
  });

  refs.completeGrid.innerHTML = '';
  refs.completeGrid.style.gridTemplateColumns = `repeat(${state.dims.l}, minmax(0, 1fr))`;
  const layer = state.selectedCompleteLayer;

  for (let row = 0; row < state.dims.w; row += 1) {
    for (let col = 0; col < state.dims.l; col += 1) {
      const active = state.complete[layer][row][col];
      const cell = document.createElement('button');
      cell.className = `grid-cell complete-cell ${active ? 'active' : ''}`;
      cell.textContent = active ? '1' : '';
      cell.addEventListener('click', () => {
        state.complete[layer][row][col] = !state.complete[layer][row][col];
        invalidateResults();
        renderCompleteEditor();
        renderAnalysisPanel();
        refreshScene();
      });
      refs.completeGrid.appendChild(cell);
    }
  }
}

function renderPieceList() {
  const refs = runtime.refs;
  if (state.pieces.length === 0) {
    refs.pieceList.innerHTML = '<div class="piece-empty">暂无拆分体，点击“添加拆分体”开始定义。</div>';
    return;
  }

  refs.pieceList.innerHTML = state.pieces
    .map(
      (piece, index) => `
      <div class="piece-card">
        <div class="piece-color" style="background:${piece.color}"></div>
        <div>
          <div class="piece-name">${piece.name || `拆分体${toCircled(index + 1)}`}</div>
          <div class="piece-count">方块数：${countVolume(piece.volume)}</div>
        </div>
        <div class="piece-count">${toCircled(index + 1)}</div>
        <button class="piece-delete" data-index="${index}" title="删除">×</button>
      </div>
    `,
    )
    .join('');

  refs.pieceList.querySelectorAll('.piece-delete').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.index);
      state.pieces.splice(index, 1);
      invalidateResults();
      renderPieceList();
      renderPieceEditor();
      renderAnalysisPanel();
      refreshScene();
      setStatus('已删除拆分体。', 'info');
    });
  });
}

function renderPieceEditor() {
  const refs = runtime.refs;
  if (!state.addingPiece) {
    refs.pieceEditor.classList.add('hidden');
    refs.addPieceBtn.textContent = '添加拆分体';
    return;
  }

  const draft = state.addingPiece;
  const count = countVolume(draft.volume);
  const placements = enumerateDraftPlacements(draft.volume);
  draft.placementCandidates = placements;

  if (draft.selectedPlacementIndex >= placements.length) {
    draft.selectedPlacementIndex = placements.length - 1;
  }
  if (draft.selectedPlacementIndex < 0 && placements.length > 0) {
    draft.selectedPlacementIndex = 0;
  }
  const selectedPlacement =
    draft.selectedPlacementIndex >= 0 ? placements[draft.selectedPlacementIndex] : null;
  const candidateKeysForLayer = getPlacementCellKeysForLayer(placements, draft.selectedLayer);

  refs.addPieceBtn.textContent = '收起编辑器';
  refs.pieceEditor.classList.remove('hidden');
  refs.pieceEditor.innerHTML = `
    <div class="piece-editor-meta">
      <strong>${draft.name}</strong>
      <span>方块数：${count}</span>
    </div>
    <div class="color-row">
      <span>颜色：</span>
      ${PALETTE.map(
        (color) => `<button class="color-dot ${draft.color === color ? 'active' : ''}" data-color="${color}" style="background:${color}"></button>`,
      ).join('')}
    </div>
    <div id="draft-tabs" class="layer-tabs"></div>
    <div id="draft-grid" class="grid-editor"></div>
    <div class="piece-editor-meta">
      <span>可放置方案：${placements.length}</span>
      <span>${selectedPlacement ? `当前方案：${draft.selectedPlacementIndex + 1}/${placements.length}` : '请先编辑形状或调整完整体'}</span>
    </div>
    <div id="placement-grid" class="grid-editor placement-grid"></div>
    <div class="quick-row">
      <button id="clear-draft-layer">清空本层</button>
      <button id="copy-draft-layer">复制上一层</button>
    </div>
    <div class="piece-editor-meta">
      <span>黄色格表示当前形状可嵌入的位置</span>
      <span>点击黄色格可选择放置方案</span>
    </div>
    <div class="piece-editor-meta">
      <span>可先按形状加入，最终计算时会自动重排位置与方向</span>
      <span>当前已加入拆分体：${state.pieces.length}</span>
    </div>
    <div class="quick-row">
      <button id="auto-pick-placement">自动选择方案</button>
      <button id="next-placement">下一个方案</button>
    </div>
    <div class="quick-row">
      <button id="cancel-draft">取消</button>
      <button id="confirm-draft">确认加入</button>
    </div>
  `;

  renderLayerTabs({
    container: refs.pieceEditor.querySelector('#draft-tabs'),
    layers: state.dims.h,
    selectedLayer: draft.selectedLayer,
    hasContent: (layer) => countLayer(draft.volume[layer]) > 0,
    onClick: (layer) => {
      draft.selectedLayer = layer;
      renderPieceEditor();
    },
  });

  const grid = refs.pieceEditor.querySelector('#draft-grid');
  grid.style.gridTemplateColumns = `repeat(${state.dims.l}, minmax(0, 1fr))`;
  const layer = draft.selectedLayer;
  for (let row = 0; row < state.dims.w; row += 1) {
    for (let col = 0; col < state.dims.l; col += 1) {
      const active = draft.volume[layer][row][col];
      const cell = document.createElement('button');
      cell.className = `grid-cell piece-cell ${active ? 'active' : ''}`;
      cell.textContent = active ? '1' : '';
      if (active) {
        cell.style.background = draft.color;
        cell.style.borderColor = draft.color;
      }
      cell.addEventListener('click', () => {
        draft.volume[layer][row][col] = !draft.volume[layer][row][col];
        draft.selectedPlacementIndex = -1;
        renderPieceEditor();
        refreshScene();
      });
      grid.appendChild(cell);
    }
  }

  const placementGrid = refs.pieceEditor.querySelector('#placement-grid');
  placementGrid.style.gridTemplateColumns = `repeat(${state.dims.l}, minmax(0, 1fr))`;
  for (let row = 0; row < state.dims.w; row += 1) {
    for (let col = 0; col < state.dims.l; col += 1) {
      const key = cellKey(layer, row, col);
      const inComplete = state.complete[layer][row][col];
      const buildable = candidateKeysForLayer.has(key);
      const inSelected = Boolean(selectedPlacement?.volume[layer][row][col]);

      const cell = document.createElement('button');
      cell.className = `grid-cell ${inComplete ? '' : 'disabled'} ${buildable ? 'candidate-cell' : ''} ${inSelected ? 'selected-placement' : ''}`;
      cell.textContent = inSelected ? '1' : '';
      if (inSelected) {
        cell.style.background = draft.color;
        cell.style.borderColor = draft.color;
        cell.style.color = '#fff';
      } else if (buildable) {
        cell.style.color = '#7f5200';
      }
      cell.addEventListener('click', () => {
        if (!buildable) {
          setStatus('该位置无法放下当前拆分体。', 'error');
          return;
        }
        const index = placements.findIndex((item) => item.volume[layer][row][col]);
        if (index < 0) {
          setStatus('未找到对应放置方案，请换一个黄色格。', 'error');
          return;
        }
        draft.selectedPlacementIndex = index;
        renderPieceEditor();
        refreshScene();
      });
      placementGrid.appendChild(cell);
    }
  }

  refs.pieceEditor.querySelectorAll('.color-dot').forEach((button) => {
    button.addEventListener('click', () => {
      draft.color = button.dataset.color;
      renderPieceEditor();
      refreshScene();
    });
  });

  refs.pieceEditor.querySelector('#clear-draft-layer').addEventListener('click', () => {
    draft.volume[draft.selectedLayer] = createLayer(state.dims.w, state.dims.l, false);
    draft.selectedPlacementIndex = -1;
    renderPieceEditor();
    refreshScene();
  });

  refs.pieceEditor.querySelector('#copy-draft-layer').addEventListener('click', () => {
    if (draft.selectedLayer === 0) {
      setStatus('第一层没有上一层可复制。', 'error');
      return;
    }
    draft.volume[draft.selectedLayer] = cloneLayer(draft.volume[draft.selectedLayer - 1]);
    draft.selectedPlacementIndex = -1;
    renderPieceEditor();
    refreshScene();
  });

  refs.pieceEditor.querySelector('#auto-pick-placement').addEventListener('click', () => {
    if (placements.length === 0) {
      setStatus('当前形状没有可嵌入位置。', 'error');
      return;
    }
    draft.selectedPlacementIndex = 0;
    renderPieceEditor();
    refreshScene();
    setStatus(`已自动选择方案 1/${placements.length}。`, 'info');
  });

  refs.pieceEditor.querySelector('#next-placement').addEventListener('click', () => {
    if (placements.length === 0) {
      setStatus('当前形状没有可嵌入位置。', 'error');
      return;
    }
    const next =
      draft.selectedPlacementIndex < 0
        ? 0
        : (draft.selectedPlacementIndex + 1) % placements.length;
    draft.selectedPlacementIndex = next;
    renderPieceEditor();
    refreshScene();
    setStatus(`已切换到方案 ${next + 1}/${placements.length}。`, 'info');
  });

  refs.pieceEditor.querySelector('#cancel-draft').addEventListener('click', () => {
    state.addingPiece = null;
    renderPieceEditor();
    refreshScene();
  });

  refs.pieceEditor.querySelector('#confirm-draft').addEventListener('click', () => {
    const pieceCount = countVolume(draft.volume);
    if (pieceCount === 0) {
      setStatus('拆分体不能为空，请至少放置一个方块。', 'error');
      return;
    }
    const globalPlacements = enumerateShapePlacements(draft.volume, new Set(), { includeVolume: true });
    if (globalPlacements.length === 0) {
      setStatus('当前拆分体在完整体中不存在任何可放置姿态。', 'error');
      return;
    }
    const pickedVolume =
      placements.length > 0
        ? cloneVolume(
            placements[draft.selectedPlacementIndex >= 0 ? draft.selectedPlacementIndex : 0].volume,
          )
        : cloneVolume(globalPlacements[0].volume);
    state.pieces.push({
      name: draft.name,
      color: draft.color,
      shape: cloneVolume(draft.volume),
      volume: pickedVolume,
    });
    state.addingPiece = null;
    invalidateResults();
    renderPieceList();
    renderPieceEditor();
    renderAnalysisPanel();
    refreshScene();
    if (placements.length === 0) {
      setStatus('拆分体已加入。当前布局暂不可放置，将在计算缺失体时自动重排。', 'info');
    } else {
      setStatus('拆分体已加入。', 'success');
    }
  });
}

function calculateMissing() {
  const completeCount = countVolume(state.complete);
  if (completeCount === 0) {
    setStatus('完整体为空，请先定义完整堆积体。', 'error');
    return;
  }
  if (state.pieces.length === 0) {
    const emptyEval = evaluateMissingFromOccupiedSet(new Set());
    state.arrangementSolutions = [];
    state.arrangementSolutionIndex = -1;
    state.results = {
      missing: emptyEval.missing,
      pieceCounts: [],
      completeCount,
      occupiedCount: emptyEval.occupiedCount,
      missingCount: emptyEval.missingCount,
      components: emptyEval.components,
    };
    state.analysisLayer = 0;
    renderFormula(true);
    renderLayerView();
    renderHints();
    refreshScene({ animateMissing: emptyEval.missingCount > 0 });
    updateSwitchSolutionButton();
    setStatus(
      `计算完成：完整体${completeCount}，已占0，缺失${emptyEval.missingCount}。`,
      'success',
    );
    return;
  }

  const solutions = findArrangementSolutions({ limit: 14, budget: 160000 });
  if (solutions.length === 0) {
    setStatus('未找到满足约束的方案：请调整拆分体形状后重试。', 'error');
    return;
  }

  state.arrangementSolutions = solutions;
  applyArrangementSolution(0, true, true);

  const current = state.arrangementSolutions[0];
  if (current.missingCount === 0) {
    setStatus('无缺失部分，已构成完整堆积体。', 'success');
    return;
  }
  let message = `计算完成：完整体${completeCount}，已占${current.occupiedCount}，缺失${current.missingCount}。`;
  if (current.changed) {
    message = `已自动重排拆分体的位置与方向。${message}`;
  }
  if (state.arrangementSolutions.length > 1) {
    message += ` 可点击“换一个方案”切换（共${state.arrangementSolutions.length}种）。`;
  }
  setStatus(message, 'success');
}

function evaluateArrangement(volumes) {
  const occupiedSet = new Set();
  let overlapCount = 0;
  volumes.forEach((volume) => {
    iterateVoxels(volume, (layer, row, col) => {
      const key = cellKey(layer, row, col);
      if (occupiedSet.has(key)) {
        overlapCount += 1;
        return;
      }
      occupiedSet.add(key);
    });
  });
  const missingStats = evaluateMissingFromOccupiedSet(occupiedSet);
  return {
    ...missingStats,
    overlapCount,
  };
}

function evaluateMissingFromOccupiedSet(occupiedSet) {
  const missing = createVolume(state.dims.h, state.dims.w, state.dims.l, false);
  let occupiedCount = 0;
  let missingCount = 0;
  for (let layer = 0; layer < state.dims.h; layer += 1) {
    for (let row = 0; row < state.dims.w; row += 1) {
      for (let col = 0; col < state.dims.l; col += 1) {
        if (!state.complete[layer][row][col]) continue;
        if (occupiedSet.has(cellKey(layer, row, col))) {
          occupiedCount += 1;
        } else {
          missing[layer][row][col] = true;
          missingCount += 1;
        }
      }
    }
  }
  const components = countComponents(missing);
  return { missing, occupiedCount, missingCount, components };
}

function findArrangementSolutions({ limit = 10, budget = 120000 } = {}) {
  const totalPieces = state.pieces.length;
  if (totalPieces === 0) return [];

  const shapes = state.pieces.map((piece) => cloneVolume(piece.shape || piece.volume));
  const currentSignatures = state.pieces.map((piece) => coordSignature(extractActiveCoords(piece.volume)));
  const currentArrangementSignature = currentSignatures.join('||');
  const assigned = Array(totalPieces).fill(null);
  const occupied = new Set();
  const used = Array(totalPieces).fill(false);
  const searchBudget = { left: budget };
  const solutionsByMissing = new Map();

  const canFitAll = shapes.every(
    (shape) => enumerateShapePlacements(shape, new Set(), { includeVolume: false }).length > 0,
  );
  if (!canFitAll) return [];

  const dfs = (depth) => {
    if (searchBudget.left <= 0 || solutionsByMissing.size >= limit) return;
    searchBudget.left -= 1;
    if (depth === totalPieces) {
      const missingStats = evaluateMissingFromOccupiedSet(occupied);
      if (missingStats.missingCount > 0 && missingStats.components !== 1) return;

      const volumes = assigned.map((coords) => volumeFromPlacedCoords(coords));
      const arrangementSignature = assigned.map((coords) => coordSignature(coords)).join('||');
      const missingSignature = coordSignature(extractActiveCoords(missingStats.missing));
      if (solutionsByMissing.has(missingSignature)) return;

      solutionsByMissing.set(missingSignature, {
        volumes,
        missing: cloneVolume(missingStats.missing),
        occupiedCount: missingStats.occupiedCount,
        missingCount: missingStats.missingCount,
        components: missingStats.components,
        arrangementSignature,
        changed: arrangementSignature !== currentArrangementSignature,
      });
      return;
    }

    let pickedPiece = -1;
    let pickedCandidates = null;
    for (let i = 0; i < totalPieces; i += 1) {
      if (used[i]) continue;
      const candidates = enumerateShapePlacements(shapes[i], occupied, { includeVolume: false });
      if (candidates.length === 0) return;
      if (pickedPiece < 0 || candidates.length < pickedCandidates.length) {
        pickedPiece = i;
        pickedCandidates = candidates;
      }
    }
    if (pickedPiece < 0) return;

    const preferred = currentSignatures[pickedPiece];
    pickedCandidates.sort((a, b) => {
      const aScore = a.signature === preferred ? 1 : 0;
      const bScore = b.signature === preferred ? 1 : 0;
      return bScore - aScore;
    });

    used[pickedPiece] = true;
    for (let i = 0; i < pickedCandidates.length; i += 1) {
      if (solutionsByMissing.size >= limit) break;
      const candidate = pickedCandidates[i];
      assigned[pickedPiece] = candidate.coords;
      candidate.coords.forEach(([col, row, layer]) => {
        occupied.add(cellKey(layer, row, col));
      });
      dfs(depth + 1);
      candidate.coords.forEach(([col, row, layer]) => {
        occupied.delete(cellKey(layer, row, col));
      });
      assigned[pickedPiece] = null;
    }
    used[pickedPiece] = false;
  };

  dfs(0);

  return [...solutionsByMissing.values()].sort((a, b) => {
    if (a.changed !== b.changed) return a.changed ? 1 : -1;
    if (a.missingCount !== b.missingCount) return a.missingCount - b.missingCount;
    return a.arrangementSignature.localeCompare(b.arrangementSignature);
  });
}

function applyArrangementSolution(index, animateMissing, resetLayer = false) {
  const solution = state.arrangementSolutions[index];
  if (!solution) return;

  state.arrangementSolutionIndex = index;
  state.pieces = state.pieces.map((piece, pieceIndex) => ({
    ...piece,
    volume: cloneVolume(solution.volumes[pieceIndex]),
  }));

  state.results = {
    missing: cloneVolume(solution.missing),
    pieceCounts: state.pieces.map((piece) => countVolume(piece.shape || piece.volume)),
    completeCount: countVolume(state.complete),
    occupiedCount: solution.occupiedCount,
    missingCount: solution.missingCount,
    components: solution.components,
  };
  if (resetLayer) {
    state.analysisLayer = 0;
  }
  renderPieceList();
  renderFormula(animateMissing);
  renderLayerView();
  renderHints();
  refreshScene({ animateMissing: animateMissing && solution.missingCount > 0 });
  updateSwitchSolutionButton();
}

function renderAnalysisPanel() {
  renderFormula(false);
  renderLayerView();
  renderHints();
}

function renderFormula(animate) {
  const refs = runtime.refs;
  if (!state.results) {
    refs.formulaBox.textContent = '点击“计算缺失体”后显示推导过程。';
    return;
  }

  const piecePart = state.results.pieceCounts
    .map((count, idx) => `${toCircled(idx + 1)}(${count})`)
    .join(' + ');
  refs.formulaBox.innerHTML = `
    完整体: ${state.results.completeCount}<br />
    ${state.results.completeCount} = ${piecePart || '无拆分体'}${piecePart ? ' + ' : ''}缺失(<span id="missing-value" class="missing-value">0</span>)
  `;
  const missingEl = refs.formulaBox.querySelector('#missing-value');
  if (!missingEl) return;
  if (!animate) {
    missingEl.textContent = String(state.results.missingCount);
    missingEl.dataset.value = String(state.results.missingCount);
    return;
  }
  animateNumber(missingEl, state.results.missingCount);
}

function renderLayerView() {
  const refs = runtime.refs;
  const layer = clampNumber(state.analysisLayer, 0, state.dims.h - 1);
  state.analysisLayer = layer;
  refs.layerTitle.textContent = `第${layer + 1}层俯视图`;
  refs.layerPrev.disabled = layer === 0;
  refs.layerNext.disabled = layer === state.dims.h - 1;
  refs.layerGrid.innerHTML = '';
  refs.layerGrid.style.gridTemplateColumns = `repeat(${state.dims.l}, minmax(0, 1fr))`;

  let total = 0;
  let occupied = 0;
  let missing = 0;

  for (let row = 0; row < state.dims.w; row += 1) {
    for (let col = 0; col < state.dims.l; col += 1) {
      const cell = document.createElement('div');
      cell.className = 'layer-cell';

      if (state.complete[layer][row][col]) {
        total += 1;
        cell.classList.add('complete');
      }

      const color = getPieceColorAt(layer, row, col);
      if (color) {
        occupied += 1;
        cell.style.background = hexToRgba(color, 0.5);
      }

      const isMissing = Boolean(state.results?.missing[layer][row][col]);
      if (isMissing) {
        missing += 1;
        cell.classList.add('missing');
      }
      refs.layerGrid.appendChild(cell);
    }
  }

  refs.layerStats.textContent = `本层总计${total}格，已占${occupied}格，缺${missing}格。`;
}

function renderHints() {
  const refs = runtime.refs;
  if (!state.results) {
    refs.hintBox.textContent = '提示：先点击“计算缺失体”，再观察各层黄色区域。';
    return;
  }
  if (state.results.missingCount === 0) {
    refs.hintBox.textContent = '当前无缺失部分，拆分体已完全构成完整堆积体。';
    return;
  }
  const first = findFirstMissing(state.results.missing);
  const layerInfo = `观察第${first.layer + 1}层第${first.row + 1}行第${first.col + 1}列附近凹陷，缺失体应有对应凸起。`;
  const componentInfo =
    state.results.components > 1 ? ` 注意：剩余形状包含${state.results.components}个分离部分。` : '';
  refs.hintBox.textContent = `${layerInfo}${componentInfo}`;
}

function renderViewButtons() {
  runtime.refs.viewButtons.querySelectorAll('button[data-view]').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === state.cameraMode);
  });
}

function updateSwitchSolutionButton() {
  const button = runtime.refs.switchSolution;
  if (!button) return;
  const total = state.arrangementSolutions.length;
  const current = state.arrangementSolutionIndex >= 0 ? state.arrangementSolutionIndex + 1 : 0;
  if (total <= 1) {
    button.textContent = '换一个方案';
    button.disabled = true;
    return;
  }
  button.textContent = `换一个方案 (${current}/${total})`;
  button.disabled = false;
}

function switchToNextSolution() {
  if (state.arrangementSolutions.length <= 1) {
    setStatus('当前没有可切换的其他方案。', 'info');
    return;
  }
  const next = (state.arrangementSolutionIndex + 1) % state.arrangementSolutions.length;
  applyArrangementSolution(next, true);
  setStatus(`已切换到方案 ${next + 1}/${state.arrangementSolutions.length}。`, 'success');
}

function renderMissingOnlyButton() {
  const button = runtime.refs.toggleMissingOnly;
  if (!button) return;
  button.textContent = state.missingOnlyMode ? '恢复显示全部' : '只显示缺失体';
  button.classList.toggle('active', state.missingOnlyMode);
}

function renderLayerTabs({ container, layers, selectedLayer, hasContent, onClick }) {
  container.innerHTML = '';
  for (let layer = 0; layer < layers; layer += 1) {
    const button = document.createElement('button');
    button.className = `layer-tab ${selectedLayer === layer ? 'active' : ''}`;
    button.textContent = String(layer + 1);
    if (hasContent(layer)) {
      const dot = document.createElement('span');
      dot.className = 'layer-dot';
      button.appendChild(dot);
    }
    button.addEventListener('click', () => onClick(layer));
    container.appendChild(button);
  }
}

function initThreeScene() {
  const refs = runtime.refs;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf8f9fa);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
  camera.position.set(10, 10, 10);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(refs.scene.clientWidth, refs.scene.clientHeight);
  renderer.shadowMap.enabled = true;
  refs.scene.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 0, 0);

  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  const directional = new THREE.DirectionalLight(0xffffff, 0.9);
  directional.position.set(10, 14, 10);
  directional.castShadow = true;
  scene.add(ambient, directional);

  const helperGroup = new THREE.Group();
  const completeGroup = new THREE.Group();
  const pieceGroup = new THREE.Group();
  const missingGroup = new THREE.Group();
  scene.add(helperGroup, completeGroup, pieceGroup, missingGroup);

  runtime.three = {
    scene,
    camera,
    renderer,
    controls,
    helperGroup,
    completeGroup,
    pieceGroup,
    missingGroup,
    pieceGroups: [],
    missingMeshes: [],
    boxGeometry: new THREE.BoxGeometry(0.92, 0.92, 0.92),
  };

  const resize = () => {
    const width = refs.scene.clientWidth;
    const height = refs.scene.clientHeight;
    if (width === 0 || height === 0) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  };
  window.addEventListener('resize', resize);
  new ResizeObserver(resize).observe(refs.scene);

  const animate = (now) => {
    requestAnimationFrame(animate);
    updateSceneAnimations(now);
    controls.update();
    renderer.render(scene, camera);
  };
  requestAnimationFrame(animate);
}

function refreshScene(options = {}) {
  const three = runtime.three;
  if (!three) return;
  clearChildren(three.completeGroup);
  clearChildren(three.pieceGroup);
  clearChildren(three.missingGroup);
  clearChildren(three.helperGroup);

  three.pieceGroups = [];
  three.missingMeshes = [];

  const { l, w, h } = state.dims;
  const maxDim = Math.max(l, w, h);
  const showOnlyMissing = state.missingOnlyMode;

  if (!showOnlyMissing) {
    const grid = new THREE.GridHelper(maxDim + 4, maxDim + 4, 0xdee2e6, 0xdee2e6);
    grid.position.y = -(h / 2) - 0.55;
    three.helperGroup.add(grid);

    const axes = new THREE.AxesHelper(1.4);
    axes.position.set(-(l / 2) - 1, -(h / 2) - 0.55, -(w / 2) - 1);
    three.helperGroup.add(axes);
    addAxisNumberLabels(three.helperGroup, { l, w, h });
  }

  const completeFillMaterial = new THREE.MeshStandardMaterial({
    color: 0x6c757d,
    transparent: true,
    opacity: state.transparencyMode ? 0 : 0.1,
    roughness: 0.8,
    metalness: 0.05,
  });
  const completeWireMaterial = new THREE.MeshBasicMaterial({
    color: 0xadb5bd,
    wireframe: true,
  });

  if (!showOnlyMissing) {
    iterateVoxels(state.complete, (layer, row, col) => {
      const group = new THREE.Group();
      const fill = new THREE.Mesh(three.boxGeometry, completeFillMaterial);
      const wire = new THREE.Mesh(three.boxGeometry, completeWireMaterial);
      group.add(fill, wire);
      group.position.copy(voxelToWorld(col, row, layer));
      three.completeGroup.add(group);
    });

    state.pieces.forEach((piece) => {
      const pieceMaterial = new THREE.MeshStandardMaterial({
        color: piece.color,
        roughness: 0.4,
        metalness: 0.1,
      });
      const group = new THREE.Group();
      iterateVoxels(piece.volume, (layer, row, col) => {
        const mesh = new THREE.Mesh(three.boxGeometry, pieceMaterial);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.position.copy(voxelToWorld(col, row, layer));
        group.add(mesh);
      });
      three.pieceGroups.push(group);
      three.pieceGroup.add(group);
    });

    if (state.addingPiece?.placementCandidates?.length) {
      const index = state.addingPiece.selectedPlacementIndex;
      const placement =
        index >= 0 && index < state.addingPiece.placementCandidates.length
          ? state.addingPiece.placementCandidates[index]
          : null;
      if (placement) {
        const previewMaterial = new THREE.MeshStandardMaterial({
          color: state.addingPiece.color,
          transparent: true,
          opacity: 0.42,
          roughness: 0.35,
          metalness: 0.1,
        });
        const previewWire = new THREE.MeshBasicMaterial({
          color: 0x1d3557,
          wireframe: true,
          transparent: true,
          opacity: 0.7,
        });
        const previewGroup = new THREE.Group();
        iterateVoxels(placement.volume, (layer, row, col) => {
          const voxel = new THREE.Group();
          const fill = new THREE.Mesh(three.boxGeometry, previewMaterial);
          const wire = new THREE.Mesh(three.boxGeometry, previewWire);
          voxel.add(fill, wire);
          voxel.position.copy(voxelToWorld(col, row, layer));
          previewGroup.add(voxel);
        });
        three.pieceGroup.add(previewGroup);
      }
    }
  }

  if (state.results?.missingCount) {
    const missingMaterial = new THREE.MeshStandardMaterial({
      color: 0xffd93d,
      emissive: 0xffd93d,
      emissiveIntensity: 0.22,
      roughness: 0.35,
      metalness: 0.05,
    });
    const missingEdgeMaterial = new THREE.MeshBasicMaterial({
      color: 0xff9f1c,
      wireframe: true,
    });
    iterateVoxels(state.results.missing, (layer, row, col) => {
      const group = new THREE.Group();
      const fill = new THREE.Mesh(three.boxGeometry, missingMaterial);
      const edge = new THREE.Mesh(three.boxGeometry, missingEdgeMaterial);
      group.add(fill, edge);
      group.position.copy(voxelToWorld(col, row, layer));
      three.missingGroup.add(group);
      three.missingMeshes.push(group);
    });
  }

  if (options.animateMissing) {
    revealMissing(0);
  }
}

function playAssemblyAnimation() {
  if (!runtime.three || state.pieces.length === 0) {
    setStatus('请先添加至少一个拆分体。', 'error');
    return;
  }
  refreshScene();
  const three = runtime.three;
  const maxDim = Math.max(state.dims.l, state.dims.w, state.dims.h);

  three.pieceGroups.forEach((group, index) => {
    const angle = (index / Math.max(three.pieceGroups.length, 1)) * Math.PI * 2;
    const start = new THREE.Vector3(Math.cos(angle) * (maxDim + 2.5), ((index % 2) - 0.5) * 2.2, Math.sin(angle) * (maxDim + 2.5));
    group.position.copy(start);
    addSceneAnimation({
      delay: index * 170,
      duration: 580,
      easing: easeOutBack,
      onUpdate: (t) => {
        group.position.lerpVectors(start, new THREE.Vector3(0, 0, 0), t);
      },
    });
  });

  if (state.results?.missingCount) {
    revealMissing(three.pieceGroups.length * 170 + 220);
  }
  setStatus('拼合动画已播放。', 'info');
}

function revealMissing(delay) {
  const three = runtime.three;
  three.missingMeshes.forEach((mesh, index) => {
    mesh.scale.setScalar(0.001);
    addSceneAnimation({
      delay: delay + index * 35,
      duration: 400,
      easing: easeOutBack,
      onUpdate: (t) => {
        mesh.scale.setScalar(Math.max(0.001, t));
      },
    });
  });
}

function applyCameraPreset(mode, instant) {
  const three = runtime.three;
  if (!three) return;
  const maxDim = Math.max(state.dims.l, state.dims.w, state.dims.h);
  const dist = maxDim * 2.7;
  const target = new THREE.Vector3(0, 0, 0);
  let to = new THREE.Vector3(dist, dist * 0.85, dist);
  if (mode === 'front') to = new THREE.Vector3(0, dist * 0.45, dist);
  if (mode === 'top') to = new THREE.Vector3(0.001, dist, 0.001);
  if (mode === 'side') to = new THREE.Vector3(dist, dist * 0.42, 0);

  if (instant) {
    three.camera.position.copy(to);
    three.controls.target.copy(target);
    three.controls.update();
    return;
  }

  const fromPos = three.camera.position.clone();
  const fromTarget = three.controls.target.clone();
  addSceneAnimation({
    delay: 0,
    duration: 500,
    easing: (t) => t * (2 - t),
    onUpdate: (t) => {
      three.camera.position.lerpVectors(fromPos, to, t);
      three.controls.target.lerpVectors(fromTarget, target, t);
      three.controls.update();
    },
  });
}

function addSceneAnimation({ delay = 0, duration = 300, easing = (x) => x, onUpdate, onComplete }) {
  runtime.sceneAnimations.push({
    delay,
    duration,
    easing,
    onUpdate,
    onComplete,
    startAt: null,
  });
}

function updateSceneAnimations(now) {
  for (let i = runtime.sceneAnimations.length - 1; i >= 0; i -= 1) {
    const animation = runtime.sceneAnimations[i];
    if (animation.startAt === null) animation.startAt = now + animation.delay;
    if (now < animation.startAt) continue;
    const raw = (now - animation.startAt) / animation.duration;
    const progress = clampNumber(raw, 0, 1);
    const eased = animation.easing(progress);
    animation.onUpdate(eased);
    if (progress >= 1) {
      animation.onComplete?.();
      runtime.sceneAnimations.splice(i, 1);
    }
  }
}

function animateNumber(element, target) {
  cancelAnimationFrame(runtime.numberAnimationId);
  const start = Number(element.dataset.value || 0);
  const begin = performance.now();
  const duration = 680;

  const step = (now) => {
    const t = clampNumber((now - begin) / duration, 0, 1);
    const eased = t * (2 - t);
    const value = Math.round(start + (target - start) * eased);
    element.textContent = String(value);
    element.dataset.value = String(value);
    if (t < 1) {
      runtime.numberAnimationId = requestAnimationFrame(step);
    }
  };
  runtime.numberAnimationId = requestAnimationFrame(step);
}

function setStatus(message, type) {
  const status = runtime.refs.status;
  status.textContent = message;
  status.className = `status ${type}`;
}

function invalidateResults() {
  state.results = null;
  state.arrangementSolutions = [];
  state.arrangementSolutionIndex = -1;
  updateSwitchSolutionButton();
}

function enumerateDraftPlacements(shapeVolume) {
  return enumerateShapePlacements(shapeVolume, getOccupiedCellSet(), { includeVolume: true });
}

function enumerateShapePlacements(shapeVolume, occupiedSet, options = {}) {
  const { includeVolume = true, requireFaceTouch = false } = options;
  const shapeCoords = extractActiveCoords(shapeVolume);
  if (shapeCoords.length === 0) return [];

  const baseCoords = normalizeCoords(shapeCoords);
  const orientations = buildUniqueOrientedCoords(baseCoords);
  const blocked = occupiedSet || new Set();
  const candidates = [];
  const seen = new Set();

  orientations.forEach((coords, orientationIndex) => {
    const bounds = getCoordBounds(coords);
    const maxOffsetX = state.dims.l - 1 - bounds.maxX;
    const maxOffsetY = state.dims.w - 1 - bounds.maxY;
    const maxOffsetZ = state.dims.h - 1 - bounds.maxZ;

    for (let offsetZ = 0; offsetZ <= maxOffsetZ; offsetZ += 1) {
      for (let offsetY = 0; offsetY <= maxOffsetY; offsetY += 1) {
        for (let offsetX = 0; offsetX <= maxOffsetX; offsetX += 1) {
          const placed = [];
          let valid = true;
          for (let i = 0; i < coords.length; i += 1) {
            const [x, y, z] = coords[i];
            const col = x + offsetX;
            const row = y + offsetY;
            const layer = z + offsetZ;
            if (!state.complete[layer][row][col]) {
              valid = false;
              break;
            }
            if (blocked.has(cellKey(layer, row, col))) {
              valid = false;
              break;
            }
            placed.push([col, row, layer]);
          }
          if (!valid) continue;
          if (requireFaceTouch && blocked.size > 0 && !hasFaceConnectionToOccupied(placed, blocked)) {
            continue;
          }

          const signature = coordSignature(placed);
          if (seen.has(signature)) continue;
          seen.add(signature);

          const candidate = {
            coords: placed,
            signature,
            orientationIndex,
            anchor: { col: offsetX, row: offsetY, layer: offsetZ },
          };
          if (includeVolume) {
            candidate.volume = volumeFromPlacedCoords(placed);
          }
          candidates.push(candidate);
        }
      }
    }
  });

  return candidates;
}

function getPlacementCellKeysForLayer(placements, layer) {
  const keys = new Set();
  placements.forEach((placement) => {
    for (let row = 0; row < state.dims.w; row += 1) {
      for (let col = 0; col < state.dims.l; col += 1) {
        if (!placement.volume[layer][row][col]) continue;
        keys.add(cellKey(layer, row, col));
      }
    }
  });
  return keys;
}

function extractActiveCoords(volume) {
  const coords = [];
  iterateVoxels(volume, (layer, row, col) => {
    coords.push([col, row, layer]);
  });
  return coords;
}

function normalizeCoords(coords) {
  const bounds = getCoordBounds(coords);
  return coords.map(([x, y, z]) => [x - bounds.minX, y - bounds.minY, z - bounds.minZ]);
}

function getCoordBounds(coords) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  coords.forEach(([x, y, z]) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  });

  return { minX, minY, minZ, maxX, maxY, maxZ };
}

function coordSignature(coords) {
  return [...coords]
    .sort((a, b) => {
      if (a[2] !== b[2]) return a[2] - b[2];
      if (a[1] !== b[1]) return a[1] - b[1];
      return a[0] - b[0];
    })
    .map(([x, y, z]) => `${x}:${y}:${z}`)
    .join('|');
}

function buildUniqueOrientedCoords(baseCoords) {
  const variants = [];
  const seen = new Set();
  ORIENTATION_TRANSFORMS.forEach((transform) => {
    const rotated = baseCoords.map((coord) => transform(coord));
    const normalized = normalizeCoords(rotated);
    const signature = coordSignature(normalized);
    if (seen.has(signature)) return;
    seen.add(signature);
    variants.push(normalized);
  });
  return variants;
}

function getOccupiedCellSet() {
  const occupied = new Set();
  state.pieces.forEach((piece) => {
    iterateVoxels(piece.volume, (layer, row, col) => {
      occupied.add(cellKey(layer, row, col));
    });
  });
  return occupied;
}

function volumeFromPlacedCoords(coords) {
  const volume = createVolume(state.dims.h, state.dims.w, state.dims.l, false);
  coords.forEach(([col, row, layer]) => {
    volume[layer][row][col] = true;
  });
  return volume;
}

function hasFaceConnectionToOccupied(placedCoords, occupiedSet) {
  const neighbors = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];

  for (let i = 0; i < placedCoords.length; i += 1) {
    const [col, row, layer] = placedCoords[i];
    for (let j = 0; j < neighbors.length; j += 1) {
      const [dx, dy, dz] = neighbors[j];
      const nCol = col + dx;
      const nRow = row + dy;
      const nLayer = layer + dz;
      if (occupiedSet.has(cellKey(nLayer, nRow, nCol))) {
        return true;
      }
    }
  }
  return false;
}

function createOrientationTransforms() {
  const transforms = [];
  const perms = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ];
  const signs = [-1, 1];

  perms.forEach((perm) => {
    const parity = permutationParity(perm);
    signs.forEach((sx) => {
      signs.forEach((sy) => {
        signs.forEach((sz) => {
          if (sx * sy * sz * parity !== 1) return;
          transforms.push(([x, y, z]) => {
            const source = [x, y, z];
            return [sx * source[perm[0]], sy * source[perm[1]], sz * source[perm[2]]];
          });
        });
      });
    });
  });
  return transforms;
}

function permutationParity(perm) {
  let inversions = 0;
  for (let i = 0; i < perm.length; i += 1) {
    for (let j = i + 1; j < perm.length; j += 1) {
      if (perm[i] > perm[j]) inversions += 1;
    }
  }
  return inversions % 2 === 0 ? 1 : -1;
}

function getDraftOverlaps(volume) {
  const occupied = new Set();
  state.pieces.forEach((piece) => {
    iterateVoxels(piece.volume, (layer, row, col) => occupied.add(cellKey(layer, row, col)));
  });
  const conflicts = new Set();
  iterateVoxels(volume, (layer, row, col) => {
    const key = cellKey(layer, row, col);
    if (occupied.has(key)) conflicts.add(key);
  });
  return conflicts;
}

function getOutsideCount(volume) {
  let outside = 0;
  iterateVoxels(volume, (layer, row, col) => {
    if (!state.complete[layer][row][col]) outside += 1;
  });
  return outside;
}

function getPieceColorAt(layer, row, col) {
  for (let i = 0; i < state.pieces.length; i += 1) {
    if (state.pieces[i].volume[layer][row][col]) return state.pieces[i].color;
  }
  return '';
}

function findFirstMissing(volume) {
  for (let layer = 0; layer < state.dims.h; layer += 1) {
    for (let row = 0; row < state.dims.w; row += 1) {
      for (let col = 0; col < state.dims.l; col += 1) {
        if (volume[layer][row][col]) return { layer, row, col };
      }
    }
  }
  return { layer: 0, row: 0, col: 0 };
}

function countComponents(volume) {
  const visited = new Set();
  let components = 0;
  const offsets = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];

  for (let layer = 0; layer < state.dims.h; layer += 1) {
    for (let row = 0; row < state.dims.w; row += 1) {
      for (let col = 0; col < state.dims.l; col += 1) {
        const key = cellKey(layer, row, col);
        if (!volume[layer][row][col] || visited.has(key)) continue;
        components += 1;
        const queue = [[layer, row, col]];
        visited.add(key);
        while (queue.length > 0) {
          const [z, y, x] = queue.shift();
          offsets.forEach(([dz, dy, dx]) => {
            const nz = z + dz;
            const ny = y + dy;
            const nx = x + dx;
            if (nz < 0 || ny < 0 || nx < 0) return;
            if (nz >= state.dims.h || ny >= state.dims.w || nx >= state.dims.l) return;
            if (!volume[nz][ny][nx]) return;
            const nKey = cellKey(nz, ny, nx);
            if (visited.has(nKey)) return;
            visited.add(nKey);
            queue.push([nz, ny, nx]);
          });
        }
      }
    }
  }
  return components;
}

function buildSamples() {
  const sampleA = (() => {
    const dims = { l: 4, w: 2, h: 3 };
    const complete = createVolume(dims.h, dims.w, dims.l, true);
    complete[1][0][0] = false;
    complete[2][1][3] = false;

    const p1 = volumeFromCoords(dims, [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 0],
      [1, 1, 0],
      [2, 0, 1],
    ]);

    const p2 = volumeFromCoords(dims, [
      [0, 0, 2],
      [0, 0, 3],
      [0, 1, 2],
      [1, 1, 2],
      [2, 0, 2],
      [2, 1, 2],
    ]);

    const p3 = volumeFromCoords(dims, [
      [0, 1, 1],
      [1, 0, 1],
      [1, 0, 2],
      [2, 0, 0],
      [2, 1, 1],
    ]);

    return {
      dims,
      complete,
      pieces: [
        { name: '拆分体①', color: '#FF6B6B', volume: p1 },
        { name: '拆分体②', color: '#4ECDC4', volume: p2 },
        { name: '拆分体③', color: '#45B7D1', volume: p3 },
      ],
    };
  })();

  const sampleB = (() => {
    const dims = { l: 3, w: 3, h: 3 };
    const complete = createVolume(dims.h, dims.w, dims.l, true);
    complete[2][2][2] = false;
    complete[1][0][2] = false;
    complete[0][2][0] = false;

    const p1 = volumeFromCoords(dims, [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 0],
      [0, 1, 1],
      [1, 1, 0],
      [1, 2, 0],
      [2, 0, 0],
      [2, 1, 0],
    ]);

    const p2 = volumeFromCoords(dims, [
      [0, 0, 2],
      [0, 1, 2],
      [0, 2, 2],
      [1, 1, 1],
      [1, 2, 1],
      [2, 0, 1],
      [2, 1, 1],
    ]);

    return {
      dims,
      complete,
      pieces: [
        { name: '拆分体①', color: '#FF6B6B', volume: p1 },
        { name: '拆分体②', color: '#4ECDC4', volume: p2 },
      ],
    };
  })();

  return {
    '2019国考': sampleA,
    '2018青海': sampleB,
  };
}

function voxelToWorld(col, row, layer) {
  const { l, w, h } = state.dims;
  return new THREE.Vector3(col - (l - 1) / 2, layer - (h - 1) / 2, row - (w - 1) / 2);
}

function volumeFromCoords(dims, coords) {
  const volume = createVolume(dims.h, dims.w, dims.l, false);
  coords.forEach(([layer, row, col]) => {
    if (layer < 0 || row < 0 || col < 0) return;
    if (layer >= dims.h || row >= dims.w || col >= dims.l) return;
    volume[layer][row][col] = true;
  });
  return volume;
}

function iterateVoxels(volume, callback) {
  for (let layer = 0; layer < volume.length; layer += 1) {
    for (let row = 0; row < volume[layer].length; row += 1) {
      for (let col = 0; col < volume[layer][row].length; col += 1) {
        if (volume[layer][row][col]) callback(layer, row, col);
      }
    }
  }
}

function countVolume(volume) {
  let count = 0;
  iterateVoxels(volume, () => {
    count += 1;
  });
  return count;
}

function countLayer(layer) {
  let count = 0;
  for (let row = 0; row < layer.length; row += 1) {
    for (let col = 0; col < layer[row].length; col += 1) {
      if (layer[row][col]) count += 1;
    }
  }
  return count;
}

function createVolume(h, w, l, fill) {
  return Array.from({ length: h }, () => createLayer(w, l, fill));
}

function createLayer(w, l, fill) {
  return Array.from({ length: w }, () => Array.from({ length: l }, () => fill));
}

function cloneVolume(volume) {
  return volume.map((layer) => cloneLayer(layer));
}

function cloneLayer(layer) {
  return layer.map((row) => [...row]);
}

function clearChildren(group) {
  while (group.children.length) {
    group.remove(group.children[0]);
  }
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function toCircled(index) {
  return CIRCLED[index - 1] || String(index);
}

function cellKey(layer, row, col) {
  return `${layer}-${row}-${col}`;
}

function hexToRgba(hex, alpha) {
  const value = hex.replace('#', '');
  const size = value.length === 3 ? 1 : 2;
  const pick = (offset) => {
    const chunk = value.slice(offset, offset + size);
    return Number.parseInt(size === 1 ? chunk + chunk : chunk, 16);
  };
  const r = pick(0);
  const g = pick(size);
  const b = pick(size * 2);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

function addAxisNumberLabels(group, dims) {
  const baseY = -(dims.h / 2) - 0.35;
  const lLabelZ = dims.w / 2 + 0.95;
  const wLabelX = -(dims.l / 2) - 0.95;
  const hLabelX = -(dims.l / 2) - 0.95;
  const hLabelZ = -(dims.w / 2) - 0.95;

  for (let col = 0; col < dims.l; col += 1) {
    const sprite = createTextSprite(String(col + 1), '#c92a2a');
    sprite.position.set(col - (dims.l - 1) / 2, baseY, lLabelZ);
    group.add(sprite);
  }

  for (let row = 0; row < dims.w; row += 1) {
    const sprite = createTextSprite(String(row + 1), '#2b8a3e');
    sprite.position.set(wLabelX, baseY, row - (dims.w - 1) / 2);
    group.add(sprite);
  }

  for (let layer = 0; layer < dims.h; layer += 1) {
    const sprite = createTextSprite(String(layer + 1), '#1864ab');
    sprite.position.set(hLabelX, layer - (dims.h - 1) / 2, hLabelZ);
    group.add(sprite);
  }

  const lTag = createTextSprite('L', '#c92a2a');
  lTag.position.set((dims.l - 1) / 2 + 0.8, baseY, lLabelZ);
  group.add(lTag);

  const wTag = createTextSprite('W', '#2b8a3e');
  wTag.position.set(wLabelX, baseY, (dims.w - 1) / 2 + 0.8);
  group.add(wTag);

  const hTag = createTextSprite('H', '#1864ab');
  hTag.position.set(hLabelX, (dims.h - 1) / 2 + 0.8, hLabelZ);
  group.add(hTag);
}

function createTextSprite(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.fillRect(8, 8, 80, 80);
  ctx.fillStyle = color;
  ctx.font = 'bold 44px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 48, 50);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.5, 0.5, 0.5);
  sprite.renderOrder = 2;
  return sprite;
}
