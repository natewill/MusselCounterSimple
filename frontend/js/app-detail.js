import {
  state,
  elements,
  apiGet,
  apiPatch,
  runImageUrl,
  setStatus,
  formatDate,
  formatModelFileNameForDisplay,
  loadRuns,
} from "./app-core.js";

async function loadImageDetail(runId, runImageId) {
  if (!state.currentRun || state.currentRun.id !== runId) {
    const runData = await apiGet(`/runs/${runId}`);
    state.currentRun = runData;
  }

  const imageData = state.currentRun.images.find(
    (img) => img.run_image_id === runImageId
  );
  if (!imageData) {
    setStatus("Image not found in run.", "error");
    return;
  }

  state.detailImage = imageData;
  state.detailDetections = imageData.detections || [];

  elements.detailImageName.textContent = imageData.displayed_file_name;
  elements.detailImage.src = runImageUrl(imageData.image_url);
  elements.detailImage.alt = imageData.displayed_file_name;

  const threshold = state.currentRun.threshold_score;
  const visibleDetections = state.detailDetections.filter(
    (d) => !d.is_deleted && d.confidence_score >= threshold
  );
  const liveCount = visibleDetections.filter((d) => d.class_name === "live").length;
  const deadCount = visibleDetections.filter((d) => d.class_name === "dead").length;

  elements.detailLive.textContent = String(liveCount);
  elements.detailDead.textContent = String(deadCount);
  elements.detailTotal.textContent = String(liveCount + deadCount);

  elements.detailModel.textContent = `Model: ${formatModelFileNameForDisplay(state.currentRun.model_file_name)}`;
  elements.detailThreshold.textContent = `Threshold: ${state.currentRun.threshold_score.toFixed(2)}`;
  elements.detailProcessed.textContent = `Processed: ${formatDate(state.currentRun.updated_at)}`;

  renderDetectionList();

  elements.detailImage.onload = () => {
    drawBoundingBoxes();
  };

  if (elements.detailImage.complete && elements.detailImage.naturalWidth > 0) {
    drawBoundingBoxes();
  }
}

function renderDetectionList() {
  elements.detailDetectionList.innerHTML = "";
  const threshold = state.currentRun ? state.currentRun.threshold_score : 0.5;

  for (let i = 0; i < state.detailDetections.length; i++) {
    const det = state.detailDetections[i];
    if (det.confidence_score < threshold && !det.is_deleted) {
      continue;
    }

    const item = document.createElement("div");
    item.className = `detection-list-item${det.is_deleted ? " is-deleted" : ""}`;
    item.addEventListener("click", () => openDetectionModal(det));

    const tag = document.createElement("span");
    tag.className = `detection-list-tag ${det.class_name}`;
    tag.textContent = det.class_name;

    const conf = document.createElement("span");
    conf.className = "detection-list-conf";
    conf.textContent = `${(det.confidence_score * 100).toFixed(0)}%`;

    item.append(tag, conf);
    elements.detailDetectionList.append(item);
  }

  if (elements.detailDetectionList.children.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No detections above threshold.";
    elements.detailDetectionList.append(empty);
  }
}

function drawBoundingBoxes() {
  const canvas = elements.detailCanvas;
  const img = elements.detailImage;
  if (!img.naturalWidth || !img.naturalHeight) {
    return;
  }

  const displayWidth = img.clientWidth;
  const displayHeight = img.clientHeight;
  canvas.width = displayWidth;
  canvas.height = displayHeight;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!state.bboxVisible || !state.currentRun) {
    return;
  }

  const scaleX = displayWidth / img.naturalWidth;
  const scaleY = displayHeight / img.naturalHeight;
  const threshold = state.currentRun.threshold_score;

  for (const det of state.detailDetections) {
    if (det.is_deleted || det.confidence_score < threshold) {
      continue;
    }

    const x = det.bbox_x1 * scaleX;
    const y = det.bbox_y1 * scaleY;
    const w = (det.bbox_x2 - det.bbox_x1) * scaleX;
    const h = (det.bbox_y2 - det.bbox_y1) * scaleY;

    const isLive = det.class_name === "live";
    const color = isLive ? "#22c55e" : "#ef4444";

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);

    const label = `${det.class_name} ${(det.confidence_score * 100).toFixed(0)}%`;
    ctx.font = "600 11px 'Geist', sans-serif";
    const textMetrics = ctx.measureText(label);
    const textHeight = 16;
    const padding = 4;
    const labelY = y > textHeight + 4 ? y - textHeight - 2 : y + h + 2;

    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(x, labelY, textMetrics.width + padding * 2, textHeight);

    ctx.fillStyle = "#fff";
    ctx.fillText(label, x + padding, labelY + 12);
  }
}

function handleCanvasClick(event) {
  if (!state.detailImage || !state.currentRun) {
    return;
  }

  const canvas = elements.detailCanvas;
  const rect = canvas.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const clickY = event.clientY - rect.top;

  const img = elements.detailImage;
  const scaleX = img.clientWidth / img.naturalWidth;
  const scaleY = img.clientHeight / img.naturalHeight;
  const threshold = state.currentRun.threshold_score;

  for (const det of state.detailDetections) {
    if (det.is_deleted || det.confidence_score < threshold) {
      continue;
    }

    const x1 = det.bbox_x1 * scaleX;
    const y1 = det.bbox_y1 * scaleY;
    const x2 = det.bbox_x2 * scaleX;
    const y2 = det.bbox_y2 * scaleY;

    if (clickX >= x1 && clickX <= x2 && clickY >= y1 && clickY <= y2) {
      openDetectionModal(det);
      return;
    }
  }
}

function openDetectionModal(detection) {
  state.editingDetection = detection;

  elements.modalTitle.textContent = `Edit Detection #${detection.id}`;

  const isLive = detection.class_name === "live";
  elements.modalClass.textContent = isLive ? "Live" : "Dead";
  elements.modalClass.style.color = isLive ? "var(--accent-green)" : "var(--accent-red)";

  elements.modalConfidence.textContent = `${(detection.confidence_score * 100).toFixed(1)}% ${detection.class_name}`;
  elements.modalEdited.textContent = detection.is_edited ? "Yes" : "No";

  elements.detectionModal.classList.remove("hidden");
}

function closeDetectionModal() {
  state.editingDetection = null;
  elements.detectionModal.classList.add("hidden");
}
async function patchDetection(detectionId, fields) {
  try {
    const response = await apiPatch(`/detections/${detectionId}`, fields);
    state.currentRun = response.run;

    const currentRunImageId = state.detailImage ? state.detailImage.run_image_id : null;
    if (currentRunImageId) {
      const updatedImage = state.currentRun.images.find(
        (img) => img.run_image_id === currentRunImageId
      );
      if (updatedImage) {
        state.detailImage = updatedImage;
        state.detailDetections = updatedImage.detections || [];
      }
    }

    const threshold = state.currentRun.threshold_score;
    const visibleDetections = state.detailDetections.filter(
      (d) => !d.is_deleted && d.confidence_score >= threshold
    );
    const liveCount = visibleDetections.filter((d) => d.class_name === "live").length;
    const deadCount = visibleDetections.filter((d) => d.class_name === "dead").length;

    elements.detailLive.textContent = String(liveCount);
    elements.detailDead.textContent = String(deadCount);
    elements.detailTotal.textContent = String(liveCount + deadCount);

    renderDetectionList();
    drawBoundingBoxes();
    closeDetectionModal();
    await loadRuns();
  } catch (error) {
    setStatus(String(error.message ?? error), "error");
  }
}

export {
  loadImageDetail,
  drawBoundingBoxes,
  handleCanvasClick,
  closeDetectionModal,
  patchDetection,
};
