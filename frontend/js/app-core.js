const state = {
  apiBaseUrl: "",
  models: [],
  runs: [],
  currentRun: null,
  pendingImagePaths: [],
  isBusy: false,
  detailImage: null,
  detailDetections: [],
  bboxVisible: true,
  editingDetection: null,
};

const elements = {
  goHome: document.getElementById("go-home"),
  goHistory: document.getElementById("go-history"),
  addModelBtn: document.getElementById("add-model-btn"),
  startNewRunButton: document.getElementById("start-new-run-btn"),
  runView: document.getElementById("run-view"),
  historyView: document.getElementById("history-view"),
  runMetaText: document.getElementById("run-meta-text"),
  currentRunTitle: document.getElementById("current-run-title"),
  currentRunProgress: document.getElementById("current-run-progress"),
  imagesTitle: document.getElementById("images-title"),
  statusBanner: document.getElementById("status-banner"),
  inferenceLoading: document.getElementById("inference-loading"),
  inferenceLoadingTrack: document.getElementById("inference-loading-track"),
  inferenceLoadingBar: document.getElementById("inference-loading-bar"),
  inferenceLoadingText: document.getElementById("inference-loading-text"),
  modelSelect: document.getElementById("model-select"),
  thresholdRange: document.getElementById("threshold-range"),
  thresholdNumber: document.getElementById("threshold-number"),
  pickImagesButton: document.getElementById("pick-images-btn"),
  runInferenceButton: document.getElementById("run-inference-btn"),
  recalculateButton: document.getElementById("recalculate-btn"),
  selectedImagesText: document.getElementById("selected-images-text"),
  summaryRunId: document.getElementById("summary-run-id"),
  summaryImages: document.getElementById("summary-images"),
  summaryLive: document.getElementById("summary-live"),
  summaryDead: document.getElementById("summary-dead"),
  summaryTotal: document.getElementById("summary-total"),
  deleteAllImagesBtn: document.getElementById("delete-all-images-btn"),
  imageGrid: document.getElementById("image-grid"),
  historyList: document.getElementById("history-list"),
  imageDetailView: document.getElementById("image-detail-view"),
  backToRunBtn: document.getElementById("back-to-run-btn"),
  detailImageName: document.getElementById("detail-image-name"),
  detailImage: document.getElementById("detail-image"),
  detailCanvas: document.getElementById("detail-canvas"),
  detailImageContainer: document.getElementById("detail-image-container"),
  bboxVisibleToggle: document.getElementById("bbox-visible-toggle"),
  detailLive: document.getElementById("detail-live"),
  detailDead: document.getElementById("detail-dead"),
  detailTotal: document.getElementById("detail-total"),
  detailModel: document.getElementById("detail-model"),
  detailThreshold: document.getElementById("detail-threshold"),
  detailProcessed: document.getElementById("detail-processed"),
  detailDetectionList: document.getElementById("detail-detection-list"),
  detectionModal: document.getElementById("detection-modal"),
  modalTitle: document.getElementById("modal-title"),
  modalClass: document.getElementById("modal-class"),
  modalConfidence: document.getElementById("modal-confidence"),
  modalEdited: document.getElementById("modal-edited"),
  modalCloseBtn: document.getElementById("modal-close-btn"),
  modalSetLive: document.getElementById("modal-set-live"),
  modalSetDead: document.getElementById("modal-set-dead"),
  modalDeleteBtn: document.getElementById("modal-delete-btn"),
};

function setBusy(isBusy) {
  state.isBusy = isBusy;
  elements.pickImagesButton.disabled = isBusy;
  elements.runInferenceButton.disabled = isBusy;
  elements.recalculateButton.disabled = isBusy;
}

function setStatus(message, type = "info") {
  if (!message) {
    elements.statusBanner.textContent = "";
    elements.statusBanner.className = "status-banner hidden";
    return;
  }

  elements.statusBanner.textContent = message;
  elements.statusBanner.className = `status-banner ${type}`;
}

function setInferenceLoading(isVisible, message = "Running model...") {
  if (!isVisible) {
    elements.inferenceLoadingBar.style.width = "0%";
    elements.inferenceLoadingTrack.setAttribute("aria-valuenow", "0");
    elements.inferenceLoadingText.textContent = "Running model... 0 / 0 images";
    elements.inferenceLoading.classList.add("hidden");
    return;
  }

  elements.inferenceLoadingText.textContent = message;
  elements.inferenceLoading.classList.remove("hidden");
}

function setInferenceProgress(processedImages, totalImages) {
  const normalizedProcessedImages = Math.max(0, Number(processedImages) || 0);
  const normalizedTotalImages = Math.max(0, Number(totalImages) || 0);

  let percentComplete = 0;
  if (normalizedTotalImages > 0) {
    const boundedProcessedImages = Math.min(normalizedProcessedImages, normalizedTotalImages);
    percentComplete = Math.round((boundedProcessedImages / normalizedTotalImages) * 100);
  }

  elements.inferenceLoadingBar.style.width = `${percentComplete}%`;
  elements.inferenceLoadingTrack.setAttribute("aria-valuenow", String(percentComplete));
  elements.inferenceLoadingText.textContent = `Running model... ${normalizedProcessedImages} / ${normalizedTotalImages} images`;
}

function waitMilliseconds(durationMilliseconds) {
  return new Promise((resolve) => setTimeout(resolve, durationMilliseconds));
}

async function pollInferenceJobUntilDone(inferenceJobId) {
  while (true) {
    const inferenceJobData = await apiGet(`/predict/jobs/${inferenceJobId}`);

    setInferenceProgress(
      inferenceJobData.processed_images,
      inferenceJobData.total_images
    );

    if (inferenceJobData.status === "completed") {
      return inferenceJobData;
    }

    if (inferenceJobData.status === "failed") {
      throw new Error(inferenceJobData.error_message || "Inference job failed.");
    }

    await waitMilliseconds(350);
  }
}

function setThresholdValue(rawValue) {
  const numeric = Number(rawValue);
  if (Number.isNaN(numeric)) {
    return;
  }

  const clamped = Math.min(1, Math.max(0, numeric));
  const fixed = clamped.toFixed(2);
  elements.thresholdRange.value = fixed;
  elements.thresholdNumber.value = fixed;
}

function getThresholdValue() {
  const parsed = Number(elements.thresholdNumber.value);
  if (Number.isNaN(parsed)) {
    return 0.5;
  }
  return Math.min(1, Math.max(0, parsed));
}

function getRoute() {
  const hashRoute = window.location.hash.replace(/^#/, "");
  return hashRoute || "/";
}

function hideAllViews() {
  elements.runView.classList.add("hidden");
  elements.historyView.classList.add("hidden");
  elements.imageDetailView.classList.add("hidden");
}

function showRunView() {
  hideAllViews();
  elements.runView.classList.remove("hidden");
}

function showHistoryView() {
  hideAllViews();
  elements.historyView.classList.remove("hidden");
}

function showImageDetailView() {
  hideAllViews();
  elements.imageDetailView.classList.remove("hidden");
}

async function apiGet(apiPath) {
  return window.desktopAPI.apiGet(apiPath);
}

async function apiPost(apiPath, body) {
  return window.desktopAPI.apiPost(apiPath, body);
}

async function apiDelete(apiPath) {
  return window.desktopAPI.apiDelete(apiPath);
}

async function apiPatch(apiPath, body) {
  return window.desktopAPI.apiPatch(apiPath, body);
}

async function waitForBackend() {
  const maxAttempts = 25;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      if (window.desktopAPI.isBackendReady) {
        const isReady = await window.desktopAPI.isBackendReady();
        if (isReady) {
          return;
        }
      } else {
        await apiGet("/models");
        return;
      }
    } catch {
      // Readiness probes should be silent retries until backend is up.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  throw new Error("Backend did not become ready in time.");
}

function renderModels() {
  const previousValue = elements.modelSelect.value;
  elements.modelSelect.innerHTML = "";

  if (state.models.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No models in app_data/models";
    elements.modelSelect.append(option);
    return;
  }

  for (const model of state.models) {
    const option = document.createElement("option");
    option.value = model.model_file_name;
    option.textContent = model.file_name;
    elements.modelSelect.append(option);
  }

  const hasPrevious = state.models.some((model) => model.model_file_name === previousValue);
  if (hasPrevious) {
    elements.modelSelect.value = previousValue;
  }
}

async function loadModels() {
  const modelsResponse = await apiGet("/models");
  state.models = modelsResponse.models;
  renderModels();
}

function formatDate(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return dateString;
  }
  return date.toLocaleString();
}

function formatRunDisplayName(runData) {
  return `Run ${runData.id} - ${formatDate(runData.created_at)}`;
}

function formatModelFileNameForDisplay(modelFileName) {
  const baseFileName = String(modelFileName || "").split(/[/\\]/).pop() || String(modelFileName || "");
  const maxLength = 36;
  if (baseFileName.length <= maxLength) {
    return baseFileName;
  }
  return `${baseFileName.slice(0, maxLength - 3)}...`;
}

function runImageUrl(relativePath) {
  if (!relativePath) {
    return "";
  }
  return `${state.apiBaseUrl}${relativePath}`;
}

function renderSelectedImageText() {
  if (state.pendingImagePaths.length === 0) {
    elements.selectedImagesText.textContent = "No new images selected.";
    if (elements.currentRunProgress) {
      const currentRunImageCount = state.currentRun ? state.currentRun.image_count : 0;
      elements.currentRunProgress.textContent = `${currentRunImageCount} images ready to process`;
    }
    return;
  }

  const previewNames = state.pendingImagePaths
    .slice(0, 3)
    .map((filePath) => filePath.split(/[/\\]/).pop());

  const overflowCount = state.pendingImagePaths.length - previewNames.length;
  const overflowText = overflowCount > 0 ? ` (+${overflowCount} more)` : "";
  elements.selectedImagesText.textContent = `Selected ${state.pendingImagePaths.length}: ${previewNames.join(
    ", "
  )}${overflowText}`;
  if (elements.currentRunProgress) {
    const currentRunImageCount = state.currentRun ? state.currentRun.image_count : 0;
    const totalReadyImages = currentRunImageCount + state.pendingImagePaths.length;
    elements.currentRunProgress.textContent = `${totalReadyImages} images ready to process`;
  }
}

function renderRunSummary() {
  const runData = state.currentRun;
  if (!runData) {
    if (elements.summaryRunId) {
      elements.summaryRunId.textContent = "New";
    }
    elements.summaryImages.textContent = "0";
    elements.summaryLive.textContent = "0";
    elements.summaryDead.textContent = "0";
    elements.summaryTotal.textContent = "0";
    if (elements.runMetaText) {
      elements.runMetaText.textContent = "Collection: New run";
    }
    if (elements.currentRunTitle) {
      elements.currentRunTitle.textContent = "New run";
    }
    if (elements.currentRunProgress) {
      elements.currentRunProgress.textContent = `${state.pendingImagePaths.length} images ready to process`;
    }
    return;
  }

  if (elements.summaryRunId) {
    elements.summaryRunId.textContent = String(runData.id);
  }
  elements.summaryImages.textContent = String(runData.image_count);
  elements.summaryLive.textContent = String(runData.live_mussel_count);
  elements.summaryDead.textContent = String(runData.dead_mussel_count);
  elements.summaryTotal.textContent = String(runData.total_mussels);
  if (elements.runMetaText) {
    elements.runMetaText.textContent = `Collection: ${formatRunDisplayName(runData)}`;
  }
  if (elements.currentRunTitle) {
    elements.currentRunTitle.textContent = `Run #${runData.id}`;
  }
  if (elements.currentRunProgress) {
    const totalReadyImages = runData.image_count + state.pendingImagePaths.length;
    elements.currentRunProgress.textContent = `${totalReadyImages} images ready to process`;
  }
}

function renderRunImages() {
  elements.imageGrid.innerHTML = "";
  if (elements.imagesTitle) {
    const imageCount = state.currentRun ? state.currentRun.images.length : 0;
    elements.imagesTitle.textContent = `Images (${imageCount})`;
  }

  if (!state.currentRun || state.currentRun.images.length === 0) {
    const emptyState = document.createElement("p");
    emptyState.className = "empty-state";
    emptyState.textContent = "No images in this run yet.";
    elements.imageGrid.append(emptyState);
    return;
  }

  for (const imageData of state.currentRun.images) {
    const card = document.createElement("article");
    card.className = "image-card";

    const imageWrapper = document.createElement("div");
    imageWrapper.className = "image-wrapper";

    const imageTag = document.createElement("img");
    imageTag.src = runImageUrl(imageData.image_url);
    imageTag.alt = imageData.displayed_file_name;
    imageTag.loading = "lazy";

    const deleteButton = document.createElement("button");
    deleteButton.className = "image-delete-btn";
    deleteButton.title = "Remove from run";
    deleteButton.textContent = "\u00d7";
    deleteButton.addEventListener("click", () => {
      removeImageFromRun(imageData.run_image_id);
    });

    imageTag.style.cursor = "pointer";
    imageTag.addEventListener("click", () => {
      if (state.currentRun) {
        window.location.hash = `/run/${state.currentRun.id}/image/${imageData.run_image_id}`;
      }
    });

    imageWrapper.append(imageTag, deleteButton);

    const meta = document.createElement("div");
    meta.className = "image-meta";

    const name = document.createElement("p");
    name.className = "image-name";
    name.title = imageData.displayed_file_name;
    name.textContent = imageData.displayed_file_name;

    const counts = document.createElement("p");
    counts.className = "image-counts";
    counts.innerHTML = `Live: <span class="count-live">${imageData.live_mussel_count}</span> &nbsp;Dead: <span class="count-dead">${imageData.dead_mussel_count}</span>`;

    meta.style.cursor = "pointer";
    meta.addEventListener("click", () => {
      if (state.currentRun) {
        window.location.hash = `/run/${state.currentRun.id}/image/${imageData.run_image_id}`;
      }
    });

    meta.append(name, counts);
    card.append(imageWrapper, meta);
    elements.imageGrid.append(card);
  }
}

function renderHistory() {
  elements.historyList.innerHTML = "";
  if (state.runs.length === 0) {
    const emptyState = document.createElement("p");
    emptyState.className = "empty-state";
    emptyState.textContent = "No runs yet.";
    elements.historyList.append(emptyState);
    return;
  }

  for (const runData of state.runs) {
    const card = document.createElement("article");
    card.className = "history-card";

    const preview = document.createElement("img");
    preview.className = "history-preview";
    preview.alt = `${formatRunDisplayName(runData)} preview`;
    if (runData.preview_image_url) {
      preview.src = runImageUrl(runData.preview_image_url);
    }

    const cardHeader = document.createElement("div");
    cardHeader.className = "history-card-header";

    const title = document.createElement("p");
    title.className = "history-title";
    title.textContent = formatRunDisplayName(runData);

    const openButton = document.createElement("button");
    openButton.className = "ghost history-open";
    openButton.textContent = "Open";
    openButton.addEventListener("click", () => {
      window.location.hash = `/run/${runData.id}`;
    });

    cardHeader.append(title, openButton);

    const badges = document.createElement("div");
    badges.className = "history-badges";
    badges.innerHTML = `
      <span class="history-badge">${runData.image_count} images</span>
      <span class="history-badge">${formatModelFileNameForDisplay(runData.model_file_name)}</span>
    `;

    const info = document.createElement("div");
    info.className = "history-info";
    const displayedModelFileName = formatModelFileNameForDisplay(runData.model_file_name);
    info.innerHTML = `
      <p class="history-created">Created ${formatDate(runData.created_at)}</p>
      <p>Live: <span class="count-live">${runData.live_mussel_count}</span> &nbsp;Dead: <span class="count-dead">${runData.dead_mussel_count}</span></p>
      <p>Threshold: ${runData.threshold_score.toFixed(2)} | Model: ${displayedModelFileName}</p>
    `;

    card.append(cardHeader, badges, preview, info);
    elements.historyList.append(card);
  }
}

async function loadRuns() {
  state.runs = await apiGet("/runs");
  renderHistory();
}

async function loadRun(runId) {
  const runData = await apiGet(`/runs/${runId}`);
  state.currentRun = runData;
  setThresholdValue(runData.threshold_score);

  if (runData.model_file_name && state.models.some((m) => m.model_file_name === runData.model_file_name)) {
    elements.modelSelect.value = runData.model_file_name;
  }

  renderRunSummary();
  renderRunImages();
}

async function refreshCurrentRunFromRoute() {
  const route = getRoute();
  const match = route.match(/^\/run\/(\d+)$/);
  if (!match) {
    return;
  }

  const runId = Number(match[1]);
  if (Number.isNaN(runId)) {
    return;
  }

  await loadRun(runId);
}

async function addModel() {
  try {
    const result = await window.desktopAPI.pickModelFile();
    if (!result) {
      return;
    }

    if (result.alreadyExists) {
      setStatus(`Model "${result.fileName}" already exists.`, "info");
    } else {
      setStatus(`Model "${result.fileName}" added.`, "info");
    }

    await loadModels();
  } catch (error) {
    setStatus(String(error.message ?? error), "error");
  }
}

async function pickImages() {
  try {
    const selectedPaths = await window.desktopAPI.pickImagePaths();
    const deduped = new Set([...state.pendingImagePaths, ...selectedPaths]);
    state.pendingImagePaths = Array.from(deduped);
    renderSelectedImageText();
  } catch (error) {
    setStatus(String(error.message ?? error), "error");
  }
}

async function runInference() {
  const modelFileName = elements.modelSelect.value;
  if (!modelFileName) {
    setStatus("No model file selected. Put a model in app_data/models first.", "error");
    return;
  }

  if (!state.currentRun && state.pendingImagePaths.length === 0) {
    setStatus("Select at least one image to start a new run.", "error");
    return;
  }

  setBusy(true);
  setInferenceLoading(true, "Running model... 0 / 0 images");
  setInferenceProgress(0, 0);
  setStatus("Running model...", "info");

  try {
    const predictStartData = await apiPost("/predict", {
      run_id: state.currentRun ? state.currentRun.id : null,
      image_ids: [],
      image_paths: state.pendingImagePaths,
      model_file_name: modelFileName,
      threshold_score: getThresholdValue(),
    });

    let predictionData = predictStartData;
    if (predictStartData.job_id && predictStartData.status !== "completed") {
      predictionData = await pollInferenceJobUntilDone(predictStartData.job_id);
    }

    if (predictionData.status === "failed") {
      throw new Error(predictionData.error_message || "Inference job failed.");
    }

    if (!predictionData.run) {
      throw new Error("Inference finished without run data.");
    }

    state.currentRun = predictionData.run;
    state.pendingImagePaths = [];
    renderSelectedImageText();
    setThresholdValue(state.currentRun.threshold_score);
    renderRunSummary();
    renderRunImages();

    await loadRuns();

    window.location.hash = `/run/${state.currentRun.id}`;
    const skippedCount =
      predictionData.skipped_image_ids.length + predictionData.skipped_images.length;
    setStatus(
      `Inference complete. Processed ${predictionData.processed_run_image_ids.length} run-image rows. Skipped ${skippedCount}.`,
      "info"
    );
  } catch (error) {
    setStatus(String(error.message ?? error), "error");
  } finally {
    setInferenceLoading(false);
    setBusy(false);
  }
}

async function removeImageFromRun(runImageId) {
  if (!state.currentRun) {
    return;
  }

  try {
    const response = await apiDelete(`/runs/${state.currentRun.id}/images/${runImageId}`);
    state.currentRun = response.run;
    renderRunSummary();
    renderRunImages();
    await loadRuns();
    setStatus("Image removed from run.", "info");
  } catch (error) {
    setStatus(String(error.message ?? error), "error");
  }
}

async function removeAllImagesFromRun() {
  if (!state.currentRun || state.currentRun.images.length === 0) {
    return;
  }

  const runImageIds = state.currentRun.images.map((img) => img.run_image_id);
  try {
    for (const runImageId of runImageIds) {
      await apiDelete(`/runs/${state.currentRun.id}/images/${runImageId}`);
    }
    state.currentRun = await apiGet(`/runs/${state.currentRun.id}`);
    renderRunSummary();
    renderRunImages();
    await loadRuns();
    setStatus(`Removed ${runImageIds.length} images from run.`, "info");
  } catch (error) {
    setStatus(String(error.message ?? error), "error");
  }
}

async function recalculate() {
  if (!state.currentRun) {
    setStatus("Open or create a run first.", "error");
    return;
  }

  setBusy(true);
  setStatus("Recalculating counts...", "info");

  try {
    const recalculateResponse = await apiPost("/recalculate", {
      run_id: state.currentRun.id,
      threshold_score: getThresholdValue(),
    });

    state.currentRun = recalculateResponse.run;
    renderRunSummary();
    renderRunImages();
    await loadRuns();
    setStatus("Recalculation complete.", "info");
  } catch (error) {
    setStatus(String(error.message ?? error), "error");
  } finally {
    setBusy(false);
  }
}

export {
  state,
  elements,
  setBusy,
  setStatus,
  setInferenceLoading,
  setInferenceProgress,
  setThresholdValue,
  getThresholdValue,
  getRoute,
  showRunView,
  showHistoryView,
  showImageDetailView,
  apiGet,
  apiPost,
  apiDelete,
  apiPatch,
  waitForBackend,
  formatDate,
  formatModelFileNameForDisplay,
  runImageUrl,
  renderSelectedImageText,
  renderRunSummary,
  renderRunImages,
  loadModels,
  loadRuns,
  loadRun,
  refreshCurrentRunFromRoute,
  addModel,
  pickImages,
  runInference,
  recalculate,
  removeAllImagesFromRun,
};
