import {
  state,
  elements,
  getRoute,
  showHistoryView,
  showImageDetailView,
  showRunView,
  setThresholdValue,
  setStatus,
  renderSelectedImageText,
  renderRunSummary,
  renderRunImages,
  waitForBackend,
  loadModels,
  loadRuns,
  refreshCurrentRunFromRoute,
  addModel,
  pickImages,
  runInference,
  recalculate,
  removeAllImagesFromRun,
} from "./app-core.js";
import {
  loadImageDetail,
  drawBoundingBoxes,
  handleCanvasClick,
  closeDetectionModal,
  patchDetection,
} from "./app-detail.js";

async function handleRouteChange() {
  const route = getRoute();

  if (route === "/history") {
    showHistoryView();
    return;
  }

  const imageMatch = route.match(/^\/run\/(\d+)\/image\/(\d+)$/);
  if (imageMatch) {
    const runId = Number(imageMatch[1]);
    const runImageId = Number(imageMatch[2]);
    await loadImageDetail(runId, runImageId);
    showImageDetailView();
    return;
  }

  showRunView();
  await refreshCurrentRunFromRoute();
  renderRunSummary();
  renderRunImages();
}

function wireEvents() {
  elements.goHome.addEventListener("click", () => {
    window.location.hash = "/";
  });

  elements.goHistory.addEventListener("click", () => {
    window.location.hash = "/history";
  });

  elements.startNewRunButton.addEventListener("click", () => {
    state.currentRun = null;
    state.pendingImagePaths = [];
    renderSelectedImageText();
    renderRunSummary();
    renderRunImages();
    window.location.hash = "/";
  });

  elements.thresholdRange.addEventListener("input", (event) => {
    setThresholdValue(event.target.value);
  });

  elements.thresholdNumber.addEventListener("input", (event) => {
    setThresholdValue(event.target.value);
  });

  elements.addModelBtn.addEventListener("click", addModel);
  elements.deleteAllImagesBtn.addEventListener("click", removeAllImagesFromRun);
  elements.pickImagesButton.addEventListener("click", pickImages);
  elements.runInferenceButton.addEventListener("click", runInference);
  elements.recalculateButton.addEventListener("click", recalculate);

  elements.backToRunBtn.addEventListener("click", () => {
    if (state.currentRun) {
      window.location.hash = `/run/${state.currentRun.id}`;
    } else {
      window.location.hash = "/";
    }
  });

  elements.bboxVisibleToggle.addEventListener("change", (event) => {
    state.bboxVisible = event.target.checked;
    drawBoundingBoxes();
  });

  elements.detailCanvas.addEventListener("click", handleCanvasClick);

  elements.modalCloseBtn.addEventListener("click", closeDetectionModal);
  elements.detectionModal.addEventListener("click", (event) => {
    if (event.target === elements.detectionModal) {
      closeDetectionModal();
    }
  });

  elements.modalSetLive.addEventListener("click", () => {
    if (state.editingDetection) {
      patchDetection(state.editingDetection.id, { class_name: "live" });
    }
  });

  elements.modalSetDead.addEventListener("click", () => {
    if (state.editingDetection) {
      patchDetection(state.editingDetection.id, { class_name: "dead" });
    }
  });

  elements.modalDeleteBtn.addEventListener("click", () => {
    if (state.editingDetection) {
      patchDetection(state.editingDetection.id, { is_deleted: true });
    }
  });

  window.addEventListener("resize", () => {
    if (!elements.imageDetailView.classList.contains("hidden")) {
      drawBoundingBoxes();
    }
  });

  window.addEventListener("hashchange", () => {
    handleRouteChange().catch((error) => {
      setStatus(String(error.message ?? error), "error");
    });
  });
}

async function initializeApp() {
  wireEvents();
  renderSelectedImageText();
  renderRunSummary();
  renderRunImages();

  try {
    state.apiBaseUrl = await window.desktopAPI.getApiBaseUrl();
    await waitForBackend();
    await loadModels();
    await loadRuns();

    if (!window.location.hash) {
      window.location.hash = "/";
    }

    await handleRouteChange();
    setStatus("Ready.", "info");
  } catch (error) {
    setStatus(String(error.message ?? error), "error");
  }
}

export { initializeApp };
