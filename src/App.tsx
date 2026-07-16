import {
  AlertTriangle,
  CheckCircle2,
  Crop,
  Download,
  Eraser,
  ExternalLink,
  FileDown,
  FlipHorizontal,
  FlipVertical,
  Image as ImageIcon,
  Palette,
  RefreshCcw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { CSSProperties, ChangeEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import appLogoUrl from "./assets/id-photo-lab-logo.svg";
import {
  DisplaySize,
  ImageTransform,
  ImageAdjustments,
  LoadedPhoto,
  clamp,
  createPrintSheet,
  downloadCanvas,
  drawPhoto,
  renderOutputCanvas,
  renderSizedCanvas,
  removeEdgeBackgroundColor,
  removeSubjectBackground,
  safeFilename,
} from "./imageCanvas";
import { PHOTO_SPECS, PhotoSpec, specHeadLabel, specSizeLabel } from "./specs";

const DEFAULT_TRANSFORM: ImageTransform = {
  x: 0,
  y: 0,
  zoom: 1,
  rotation: 0,
  flipX: false,
  flipY: false,
};

const DEFAULT_ADJUSTMENTS: ImageAdjustments = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  grayscale: 0,
  sepia: 0,
  soften: 0,
};

const BACKGROUND_SWATCHES = ["#ffffff", "#f7f8f2", "#eef3f7", "#d8ecff", "#f4f4f4", "#dde3e1"];
const FREE_EDIT_ID = "free-edit";
const DEFAULT_BACKGROUND_COLOR = "#ffffff";

type DragState = {
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

type RulerAxis = "horizontal" | "vertical";
type RulerUnit = "mm" | "px";

type RulerTick = {
  value: number;
  percent: number;
  major: boolean;
  label: string;
};

function App() {
  const [specId, setSpecId] = useState(FREE_EDIT_ID);
  const spec = useMemo<PhotoSpec | null>(
    () => PHOTO_SPECS.find((item) => item.id === specId) ?? null,
    [specId],
  );
  const [photo, setPhoto] = useState<LoadedPhoto | null>(null);
  const [processedPhoto, setProcessedPhoto] = useState<LoadedPhoto | null>(null);
  const [transform, setTransform] = useState<ImageTransform>({ ...DEFAULT_TRANSFORM });
  const [adjustments, setAdjustments] = useState<ImageAdjustments>({ ...DEFAULT_ADJUSTMENTS });
  const [backgroundColor, setBackgroundColor] = useState(DEFAULT_BACKGROUND_COLOR);
  const [backgroundTolerance, setBackgroundTolerance] = useState(58);
  const [backgroundStatus, setBackgroundStatus] = useState<"idle" | "processing" | "done">("idle");
  const [subjectStatus, setSubjectStatus] = useState<"idle" | "processing" | "done">("idle");
  const [subjectProgress, setSubjectProgress] = useState("");
  const [transparentPreview, setTransparentPreview] = useState(false);
  const [displaySize, setDisplaySize] = useState({ width: 720, height: 720 });
  const [error, setError] = useState("");
  const [isDraggingPhoto, setIsDraggingPhoto] = useState(false);
  const [query, setQuery] = useState("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const frameWrapRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const activePhotoRef = useRef<LoadedPhoto | null>(null);
  const filteredSpecs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return PHOTO_SPECS;
    }

    return PHOTO_SPECS.filter((item) =>
      [
        item.country,
        item.countryCode,
        item.document,
        item.category,
        item.sourceName,
        item.sizeLabel,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [query]);
  const countryCount = useMemo(
    () => new Set(PHOTO_SPECS.map((item) => item.countryCode)).size,
    [],
  );
  const activePhoto = processedPhoto ?? photo;
  const isFreeEdit = !spec;
  const frameAspectHeight = spec
    ? spec.outputHeightPx / spec.outputWidthPx
    : activePhoto
      ? activePhoto.height / activePhoto.width
      : 1;
  const drawOptions = useMemo(
    () => ({
      fillColor: backgroundColor,
      adjustments,
      transparentBackground: transparentPreview,
    }),
    [adjustments, backgroundColor, transparentPreview],
  );

  useEffect(() => {
    activePhotoRef.current = activePhoto;
  }, [activePhoto]);

  useEffect(() => {
    const wrap = frameWrapRef.current;
    if (!wrap) {
      return undefined;
    }

    const updateFrameSize = (wrapWidth: number) => {
      const compactLayout = window.matchMedia("(max-width: 820px)").matches;
      const rulerWidth = compactLayout ? 32 : 38;
      const maxFrameWidth = Math.max(220, Math.min(700, wrapWidth - rulerWidth));
      const maxFrameHeight = Math.min(window.innerHeight * (compactLayout ? 0.62 : 0.68), 760);
      const widthFromHeight = maxFrameHeight / frameAspectHeight;
      const width = Math.round(Math.max(220, Math.min(maxFrameWidth, widthFromHeight)));
      const height = Math.round(width * frameAspectHeight);

      setDisplaySize({ width, height });
    };

    const observer = new ResizeObserver(([entry]) => {
      updateFrameSize(entry.contentRect.width);
    });
    const handleWindowResize = () => {
      updateFrameSize(wrap.getBoundingClientRect().width);
    };

    observer.observe(wrap);
    window.addEventListener("resize", handleWindowResize);
    updateFrameSize(wrap.getBoundingClientRect().width);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", handleWindowResize);
    };
  }, [frameAspectHeight]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) {
      return undefined;
    }

    const handleNativeWheel = (event: globalThis.WheelEvent) => {
      if (!activePhotoRef.current) {
        return;
      }

      event.preventDefault();
      const delta = -event.deltaY * 0.0015;
      setTransform((current) => ({
        ...current,
        zoom: Number(clamp(current.zoom + delta, 0.55, 3.2).toFixed(3)),
      }));
    };

    frame.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => frame.removeEventListener("wheel", handleNativeWheel);
  }, []);


  useEffect(() => {
    if (spec) {
      setBackgroundColor(spec.backgroundColor);
    }
  }, [spec]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = Math.round(displaySize.width * pixelRatio);
    canvas.height = Math.round(displaySize.height * pixelRatio);
    canvas.style.width = `${displaySize.width}px`;
    canvas.style.height = `${displaySize.height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    if (activePhoto) {
      drawPhoto(ctx, activePhoto, displaySize.width, displaySize.height, transform, displaySize, drawOptions);
      return;
    }

    ctx.clearRect(0, 0, displaySize.width, displaySize.height);
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, displaySize.width, displaySize.height);
  }, [activePhoto, backgroundColor, displaySize, drawOptions, transform]);

  useEffect(() => {
    return () => {
      if (photo?.url) {
        URL.revokeObjectURL(photo.url);
      }
    };
  }, [photo]);

  useEffect(() => {
    return () => {
      if (processedPhoto?.url) {
        URL.revokeObjectURL(processedPhoto.url);
      }
    };
  }, [processedPhoto]);

  function resetTransform() {
    setTransform({ ...DEFAULT_TRANSFORM });
  }

  function resetEdits() {
    setProcessedPhoto(null);
    setBackgroundStatus("idle");
    setSubjectStatus("idle");
    setSubjectProgress("");
    setTransparentPreview(false);
    setAdjustments({ ...DEFAULT_ADJUSTMENTS });
    setBackgroundColor(spec?.backgroundColor ?? DEFAULT_BACKGROUND_COLOR);
  }

  function loadPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setError("");
    setBackgroundStatus("idle");
    setSubjectStatus("idle");
    setSubjectProgress("");
    setTransparentPreview(false);

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Choose a JPG, PNG, HEIC, or another browser-supported image file.");
      return;
    }

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setPhoto((previous) => {
        if (previous?.url) {
          URL.revokeObjectURL(previous.url);
        }
        return {
          img,
          url,
          name: file.name,
          width: img.naturalWidth,
          height: img.naturalHeight,
        };
      });
      setProcessedPhoto(null);
      setSubjectStatus("idle");
      setSubjectProgress("");
      setTransparentPreview(false);
      setAdjustments({ ...DEFAULT_ADJUSTMENTS });
      setBackgroundColor(spec?.backgroundColor ?? DEFAULT_BACKGROUND_COLOR);
      resetTransform();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setError("This image could not be opened by the browser. Try a JPG or PNG export.");
    };
    img.src = url;
    event.target.value = "";
  }

  function updateTransform(patch: Partial<ImageTransform>) {
    setTransform((current) => ({
      ...current,
      ...patch,
    }));
  }

  function updateAdjustment(key: keyof ImageAdjustments, value: number) {
    setAdjustments((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function getCurrentDisplaySize(): DisplaySize {
    const frame = frameRef.current;
    if (!frame) {
      return displaySize;
    }

    const rect = frame.getBoundingClientRect();
    return {
      width: Math.max(1, Math.round(frame.clientWidth || rect.width || displaySize.width)),
      height: Math.max(1, Math.round(frame.clientHeight || rect.height || displaySize.height)),
    };
  }

  function getFreeEditOutputSize(photoForOutput: LoadedPhoto | null = activePhoto): DisplaySize {
    if (!photoForOutput) {
      return getCurrentDisplaySize();
    }

    return {
      width: photoForOutput.width,
      height: photoForOutput.height,
    };
  }

  function renderDownloadCanvas(photoToRender: LoadedPhoto, transparentBackground: boolean): HTMLCanvasElement {
    const display = getCurrentDisplaySize();
    const options = {
      ...drawOptions,
      transparentBackground,
    };

    if (spec) {
      return renderOutputCanvas(photoToRender, spec, transform, display, options);
    }

    const outputSize = getFreeEditOutputSize(photoToRender);
    return renderSizedCanvas(
      photoToRender,
      transform,
      display,
      options,
      outputSize.width,
      outputSize.height,
    );
  }

  async function processBackgroundColor() {
    if (!photo) {
      setError("Upload a photo before removing the background.");
      return;
    }

    if (backgroundStatus === "processing") {
      return;
    }

    try {
      setError("");
      setBackgroundStatus("processing");
      const result = await removeEdgeBackgroundColor(photo, backgroundTolerance);
      setProcessedPhoto(result);
      setBackgroundStatus("done");
    } catch (backgroundError) {
      setBackgroundStatus("idle");
      setError(
        backgroundError instanceof Error
          ? backgroundError.message
          : "The background could not be removed from this photo.",
      );
    }
  }

  async function handleRemoveSubjectBackground() {
    if (!photo) {
      setError("Upload a photo before removing the background.");
      return;
    }

    if (subjectStatus === "processing") {
      return;
    }

    try {
      setError("");
      setSubjectStatus("processing");
      setSubjectProgress("Preparing model");
      const result = await removeSubjectBackground(photo, (label, percent) => {
        setSubjectProgress(`${label} ${percent}%`);
      });
      setProcessedPhoto(result);
      setSubjectStatus("done");
      setSubjectProgress("");
      setTransparentPreview(true);
      setBackgroundStatus("done");
    } catch (backgroundError) {
      setSubjectStatus("idle");
      setSubjectProgress("");
      setError(
        backgroundError instanceof Error
          ? backgroundError.message
          : "The background could not be removed from this photo.",
      );
    }
  }

  async function handleRemoveBackgroundColor() {
    await processBackgroundColor();
  }

  function handleBackgroundColorChange(color: string) {
    setBackgroundColor(color);
    setTransparentPreview(false);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!activePhoto) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDraggingPhoto(true);
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: transform.x,
      originY: transform.y,
    };
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }
    event.preventDefault();

    updateTransform({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    });
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer capture may already be released if the browser cancelled the drag.
      }
    }
    dragRef.current = null;
    setIsDraggingPhoto(false);
  }

  function zoomPhoto(delta: number) {
    if (!activePhoto) {
      return;
    }

    setTransform((current) => ({
      ...current,
      zoom: Number(clamp(current.zoom + delta, 0.55, 3.2).toFixed(3)),
    }));
  }

  async function exportPhoto() {
    if (!activePhoto) {
      setError("Upload a photo before exporting.");
      return;
    }

    const canvas = renderDownloadCanvas(activePhoto, false);
    const filename = spec
      ? `${safeFilename([spec.countryCode, spec.document, "photo"])}.jpg`
      : `${safeFilename([activePhoto.name.replace(/\.[^.]+$/, ""), "edited"])}.jpg`;
    await downloadCanvas(canvas, filename);
  }

  async function exportTransparentPhoto() {
    if (!activePhoto) {
      setError("Upload a photo before exporting.");
      return;
    }

    const canvas = renderDownloadCanvas(activePhoto, true);
    const filename = spec
      ? `${safeFilename([spec.countryCode, spec.document, "transparent"])}.png`
      : `${safeFilename([activePhoto.name.replace(/\.[^.]+$/, ""), "transparent"])}.png`;
    await downloadCanvas(canvas, filename, 1, "image/png");
  }

  async function exportSheet() {
    if (!activePhoto) {
      setError("Upload a photo before exporting.");
      return;
    }

    if (!spec) {
      setError("Select a document spec before exporting a 4x6 print sheet.");
      return;
    }

    if (spec.isDigitalOnly) {
      setError("This is a pixel-only document spec, so a physical 4x6 print sheet is not available.");
      return;
    }

    const canvas = createPrintSheet(activePhoto, spec, transform, getCurrentDisplaySize(), {
      ...drawOptions,
      transparentBackground: false,
    });
    const filename = `${safeFilename([spec.countryCode, spec.document, "4x6-sheet"])}.jpg`;
    await downloadCanvas(canvas, filename, 0.97);
  }

  useEffect(() => {
    const menuApi = window.idPhotoLab;
    if (!menuApi) {
      return undefined;
    }

    return menuApi.onMenuCommand((command) => {
      switch (command) {
        case "upload-photo":
          uploadInputRef.current?.click();
          break;
        case "download-photo":
          void exportPhoto();
          break;
        case "download-transparent":
          void exportTransparentPhoto();
          break;
        case "download-sheet":
          void exportSheet();
          break;
        case "reset-edits":
          setError("");
          resetTransform();
          resetEdits();
          break;
        case "remove-background":
          void handleRemoveSubjectBackground();
          break;
        default:
          break;
      }
    });
  });

  const rulerUnit: RulerUnit = spec ? "mm" : "px";
  const rulerWidth = spec?.widthMm ?? activePhoto?.width ?? displaySize.width;
  const rulerHeight = spec?.heightMm ?? activePhoto?.height ?? displaySize.height;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <img className="brand-logo" src={appLogoUrl} alt="" aria-hidden="true" />
          <h1>ID Photo Lab</h1>
        </div>
        <div className="status-pill">
          <CheckCircle2 size={16} aria-hidden="true" />
          <span>{photo ? "Photo loaded" : "Waiting for photo"}</span>
        </div>
      </header>

      <section className="workspace" aria-label="ID photo editor">
        <aside className="panel profile-panel">
          <div className="section-heading">
            <span>Mode / Document</span>
            <span>{filteredSpecs.length} / {PHOTO_SPECS.length}</span>
          </div>
          <label className="search-field">
            <Search size={16} aria-hidden="true" />
            <input
              aria-label="Search country or document"
              placeholder={`Search ${countryCount} countries`}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="profile-list" role="listbox" aria-label="Country and document type">
            <button
              className={`profile-option ${isFreeEdit ? "selected" : ""}`}
              type="button"
              onClick={() => {
                setSpecId(FREE_EDIT_ID);
                resetTransform();
              }}
              role="option"
              aria-selected={isFreeEdit}
            >
              <span className="country-code">EDIT</span>
              <span>
                <strong>Free edit</strong>
                <small>No document size or ID-photo rules</small>
              </span>
            </button>
            {filteredSpecs.map((item) => (
              <button
                className={`profile-option ${item.id === spec?.id ? "selected" : ""}`}
                key={item.id}
                type="button"
                onClick={() => {
                  setSpecId(item.id);
                  resetTransform();
                }}
                role="option"
                aria-selected={item.id === spec?.id}
              >
                <span className="country-code">{item.countryCode}</span>
                <span>
                  <strong>{item.country}</strong>
                  <small>{item.document}{item.category ? ` - ${item.category}` : ""}</small>
                </span>
              </button>
            ))}
            {filteredSpecs.length === 0 ? (
              <div className="empty-results">No matching document specs</div>
            ) : null}
          </div>

          <label className="upload-button">
            <Upload size={18} aria-hidden="true" />
            <span>{photo ? "Replace photo" : "Upload photo"}</span>
            <input ref={uploadInputRef} accept="image/*" type="file" onChange={loadPhoto} />
          </label>

          {error ? (
            <div className="error-message" role="alert">
              <AlertTriangle size={16} aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}
        </aside>

        <section className="editor-panel">
          <div className="editor-toolbar" aria-label="Photo controls">
            <div className="control-group">
              <Crop size={17} aria-hidden="true" />
              <span>Crop</span>
            </div>
            <div className="zoom-control" aria-label="Zoom controls">
              <button
                aria-label="Zoom out"
                className="icon-button square"
                disabled={!activePhoto}
                title="Zoom out"
                type="button"
                onClick={() => zoomPhoto(-0.08)}
              >
                <ZoomOut size={17} aria-hidden="true" />
              </button>
              <input
                aria-label="Zoom"
                disabled={!activePhoto}
                max="3.2"
                min="0.55"
                step="0.01"
                type="range"
                value={transform.zoom}
                onChange={(event) => updateTransform({ zoom: Number(event.target.value) })}
              />
              <button
                aria-label="Zoom in"
                className="icon-button square"
                disabled={!activePhoto}
                title="Zoom in"
                type="button"
                onClick={() => zoomPhoto(0.08)}
              >
                <ZoomIn size={17} aria-hidden="true" />
              </button>
            </div>
            <label className="slider-control">
              <RotateCcw size={17} aria-hidden="true" />
              <input
                aria-label="Rotate"
                disabled={!activePhoto}
                max="10"
                min="-10"
                step="0.1"
                type="range"
                value={transform.rotation}
                onChange={(event) => updateTransform({ rotation: Number(event.target.value) })}
              />
            </label>
            <div className="button-cluster">
              <button
                aria-label="Flip horizontal"
                className={`icon-button square ${transform.flipX ? "active" : ""}`}
                disabled={!activePhoto}
                title="Flip horizontal"
                type="button"
                onClick={() => updateTransform({ flipX: !transform.flipX })}
              >
                <FlipHorizontal size={17} aria-hidden="true" />
              </button>
              <button
                aria-label="Flip vertical"
                className={`icon-button square ${transform.flipY ? "active" : ""}`}
                disabled={!activePhoto}
                title="Flip vertical"
                type="button"
                onClick={() => updateTransform({ flipY: !transform.flipY })}
              >
                <FlipVertical size={17} aria-hidden="true" />
              </button>
              <button className="icon-button" disabled={!activePhoto} type="button" onClick={resetTransform}>
                <RefreshCcw size={17} aria-hidden="true" />
                <span>Reset</span>
              </button>
            </div>
          </div>

          <div className="edit-tools" aria-label="Photo edit operations">
            <section className="tool-section">
              <div className="tool-heading">
                <Palette size={16} aria-hidden="true" />
                <span>Background</span>
              </div>
              <div className="swatch-row" aria-label="Background color">
                {BACKGROUND_SWATCHES.map((color) => (
                  <button
                    aria-label={`Use ${color} background`}
                    className={`swatch ${color.toLowerCase() === backgroundColor.toLowerCase() ? "selected" : ""}`}
                    disabled={!photo}
                    key={color}
                    style={{ backgroundColor: color }}
                    title={color}
                    type="button"
                    onClick={() => handleBackgroundColorChange(color)}
                  />
                ))}
                <label className="color-input" title="Custom background color">
                  <input
                    aria-label="Custom background color"
                    disabled={!photo}
                    type="color"
                    value={backgroundColor}
                    onChange={(event) => handleBackgroundColorChange(event.target.value)}
                  />
                  <span>{backgroundColor}</span>
                </label>
              </div>
              <div className="tool-actions">
                <button
                  className="tool-button"
                  disabled={!photo || subjectStatus === "processing"}
                  type="button"
                  onClick={handleRemoveSubjectBackground}
                >
                  <Sparkles size={16} aria-hidden="true" />
                  <span>{subjectStatus === "processing" ? "Removing" : "Remove background"}</span>
                </button>
                <button
                  className="tool-button secondary"
                  disabled={!photo || backgroundStatus === "processing"}
                  type="button"
                  onClick={handleRemoveBackgroundColor}
                >
                  <Eraser size={16} aria-hidden="true" />
                  <span>{backgroundStatus === "processing" ? "Cleaning" : "Remove color"}</span>
                </button>
                <button
                  className="tool-button secondary"
                  disabled={!photo}
                  type="button"
                  onClick={resetEdits}
                >
                  <RefreshCcw size={16} aria-hidden="true" />
                  <span>Reset edits</span>
                </button>
              </div>
              {subjectProgress ? <div className="tool-note">{subjectProgress}</div> : null}
              <label className="toggle-control">
                <input
                  checked={transparentPreview}
                  disabled={!processedPhoto}
                  type="checkbox"
                  onChange={(event) => setTransparentPreview(event.target.checked)}
                />
                <span>Transparent preview</span>
              </label>
              <label className="slider-control compact">
                <span>Tolerance</span>
                <input
                  aria-label="Background removal tolerance"
                  disabled={!photo || backgroundStatus === "processing"}
                  max="95"
                  min="16"
                  step="1"
                  type="range"
                  value={backgroundTolerance}
                  onChange={(event) => setBackgroundTolerance(Number(event.target.value))}
                />
                <output>{backgroundTolerance}</output>
              </label>
            </section>

            <section className="tool-section">
              <div className="tool-heading">
                <SlidersHorizontal size={16} aria-hidden="true" />
                <span>Adjust</span>
              </div>
              <label className="slider-control compact">
                <span>Brightness</span>
                <input
                  aria-label="Brightness"
                  disabled={!activePhoto}
                  max="160"
                  min="40"
                  step="1"
                  type="range"
                  value={adjustments.brightness}
                  onChange={(event) => updateAdjustment("brightness", Number(event.target.value))}
                />
                <output>{adjustments.brightness}%</output>
              </label>
              <label className="slider-control compact">
                <span>Contrast</span>
                <input
                  aria-label="Contrast"
                  disabled={!activePhoto}
                  max="180"
                  min="40"
                  step="1"
                  type="range"
                  value={adjustments.contrast}
                  onChange={(event) => updateAdjustment("contrast", Number(event.target.value))}
                />
                <output>{adjustments.contrast}%</output>
              </label>
              <label className="slider-control compact">
                <span>Saturation</span>
                <input
                  aria-label="Saturation"
                  disabled={!activePhoto}
                  max="180"
                  min="0"
                  step="1"
                  type="range"
                  value={adjustments.saturation}
                  onChange={(event) => updateAdjustment("saturation", Number(event.target.value))}
                />
                <output>{adjustments.saturation}%</output>
              </label>
              <label className="slider-control compact">
                <span>Grayscale</span>
                <input
                  aria-label="Grayscale"
                  disabled={!activePhoto}
                  max="100"
                  min="0"
                  step="1"
                  type="range"
                  value={adjustments.grayscale}
                  onChange={(event) => updateAdjustment("grayscale", Number(event.target.value))}
                />
                <output>{adjustments.grayscale}%</output>
              </label>
              <label className="slider-control compact">
                <span>Sepia</span>
                <input
                  aria-label="Sepia"
                  disabled={!activePhoto}
                  max="100"
                  min="0"
                  step="1"
                  type="range"
                  value={adjustments.sepia}
                  onChange={(event) => updateAdjustment("sepia", Number(event.target.value))}
                />
                <output>{adjustments.sepia}%</output>
              </label>
              <label className="slider-control compact">
                <span>Soften</span>
                <input
                  aria-label="Soften"
                  disabled={!activePhoto}
                  max="1.6"
                  min="0"
                  step="0.1"
                  type="range"
                  value={adjustments.soften}
                  onChange={(event) => updateAdjustment("soften", Number(event.target.value))}
                />
                <output>{adjustments.soften.toFixed(1)}</output>
              </label>
            </section>
          </div>

          <div className="frame-wrap" ref={frameWrapRef}>
            <div
              className="ruler-stage"
              aria-label={`Editor ruler, ${formatRulerValue(rulerWidth)} by ${formatRulerValue(rulerHeight)} ${rulerUnit}`}
              style={{
                "--frame-width": `${displaySize.width}px`,
                "--frame-height": `${displaySize.height}px`,
              } as CSSProperties}
            >
              <div className="ruler-corner">{rulerUnit}</div>
              <Ruler axis="horizontal" length={rulerWidth} unit={rulerUnit} />
              <Ruler axis="vertical" length={rulerHeight} unit={rulerUnit} />
              <div className="ruler-content">
                <div
                  className={`photo-frame ${activePhoto ? "editable" : ""} ${isDraggingPhoto ? "dragging" : ""} ${transparentPreview ? "transparent" : ""}`}
                  ref={frameRef}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                >
                  <canvas
                    aria-label="Photo crop preview"
                    className={photo ? "photo-canvas loaded" : "photo-canvas"}
                    ref={canvasRef}
                  />
                  {spec ? <GuideOverlay spec={spec} /> : null}
                  {!photo ? (
                    <div className="empty-state">
                      <ImageIcon size={42} aria-hidden="true" />
                      <span>Upload a front-facing portrait</span>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="panel output-panel">
          <div className="spec-header">
            <div>
              <p className="eyebrow">{spec?.countryCode ?? "Edit"}</p>
              <h2>{spec?.document ?? "Free edit"}</h2>
            </div>
            {spec?.sourceUrl ? (
              <a href={spec.sourceUrl} rel="noreferrer" target="_blank" title="Open source">
                <ExternalLink size={18} aria-hidden="true" />
              </a>
            ) : null}
          </div>

          <div className="measurement-grid" aria-label="Output measurements">
            {spec ? (
              <>
                <Metric label="Size" value={specSizeLabel(spec)} />
                <Metric label="Pixels" value={`${spec.outputWidthPx} x ${spec.outputHeightPx}`} />
                <Metric label="Head" value={specHeadLabel(spec)} />
                <Metric label="DPI" value={`${spec.dpi}`} />
              </>
            ) : (
              <>
                <Metric label="Mode" value="Free edit" />
                <Metric label="Output" value={activePhoto ? `${activePhoto.width} x ${activePhoto.height}` : "Original image"} />
                <Metric label="Rules" value="None" />
                <Metric label="Frame" value={`${displaySize.width} x ${displaySize.height}`} />
              </>
            )}
          </div>

          <div className="note-block">
            <h3>{spec ? "Requirements" : "Export"}</h3>
            {spec ? (
              <ul>
                {spec.qualityNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            ) : (
              <ul>
                <li>Downloads the current editor view without document sizing rules.</li>
                <li>Uses the edited image dimensions for the output file.</li>
                <li>Select a document spec when you need official ID-photo dimensions.</li>
              </ul>
            )}
          </div>

          {spec ? <div className="note-block caution">
            <h3>Checks</h3>
            <ul>
              {spec.cautionNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div> : null}

          <div className="download-actions">
            <button disabled={!activePhoto} type="button" onClick={exportPhoto}>
              <Download size={18} aria-hidden="true" />
              <span>{spec ? "Download photo" : "Download current edit"}</span>
            </button>
            <button
              disabled={!processedPhoto}
              title={processedPhoto ? "Download transparent PNG cutout" : "Remove the background first"}
              type="button"
              onClick={exportTransparentPhoto}
            >
              <Download size={18} aria-hidden="true" />
              <span>Download transparent PNG</span>
            </button>
            <button
              disabled={!photo || !spec || spec.isDigitalOnly}
              title={!spec ? "Select a document spec to create a 4x6 sheet" : spec.isDigitalOnly ? "Pixel-only specs do not define a physical print size" : "Download 4x6 sheet"}
              type="button"
              onClick={exportSheet}
            >
              <FileDown size={18} aria-hidden="true" />
              <span>Download 4x6 sheet</span>
            </button>
          </div>

          {spec ? <p className="source-note">
            Source checked {spec.checkedAt}: {spec.sourceName}
          </p> : null}
        </aside>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatRulerValue(value: number) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

function niceRulerStep(rawStep: number): number {
  const exponent = Math.floor(Math.log10(Math.max(1, rawStep)));
  const magnitude = 10 ** exponent;
  const normalized = rawStep / magnitude;

  if (normalized <= 1) {
    return magnitude;
  }

  if (normalized <= 2) {
    return 2 * magnitude;
  }

  if (normalized <= 5) {
    return 5 * magnitude;
  }

  return 10 * magnitude;
}

function createRulerTicks(length: number, unit: RulerUnit): RulerTick[] {
  const ticks: RulerTick[] = [];
  const majorStep = unit === "mm" ? (length <= 35 ? 5 : 10) : niceRulerStep(length / 6);
  const step = unit === "mm" ? (length <= 35 ? 2.5 : 5) : majorStep / 2;
  const steps = Math.floor(length / step);

  for (let index = 0; index <= steps; index += 1) {
    const value = Number((index * step).toFixed(2));
    const isEnd = Math.abs(value - length) < 0.01;
    const major = index === 0 || isEnd || Math.abs(value % majorStep) < 0.01;
    ticks.push({
      value,
      percent: (value / length) * 100,
      major,
      label: major ? formatRulerValue(value) : "",
    });
  }

  const lastTick = ticks[ticks.length - 1];
  if (!lastTick || Math.abs(lastTick.value - length) > 0.01) {
    ticks.push({
      value: length,
      percent: 100,
      major: true,
      label: formatRulerValue(length),
    });
  }

  return ticks;
}

function Ruler({ axis, length, unit }: { axis: RulerAxis; length: number; unit: RulerUnit }) {
  const ticks = useMemo(() => createRulerTicks(length, unit), [length, unit]);

  return (
    <div className={`ruler ${axis}`} aria-hidden="true">
      {ticks.map((tick) => (
        <span
          className={`ruler-tick ${tick.major ? "major" : "minor"}`}
          key={`${axis}-${tick.value}`}
          style={axis === "horizontal" ? { left: `${tick.percent}%` } : { top: `${tick.percent}%` }}
        >
          {tick.label ? <span className="ruler-label">{tick.label}</span> : null}
        </span>
      ))}
    </div>
  );
}

function GuideOverlay({ spec }: { spec: PhotoSpec }) {
  const toPct = (value: number) => Math.min(100, Math.max(0, value));
  const crownY = toPct((spec.crownTopMarginMm / spec.heightMm) * 100);
  const chinY = toPct(((spec.crownTopMarginMm + spec.headTargetMm) / spec.heightMm) * 100);
  const headBandTop = toPct(
    ((spec.crownTopMarginMm + spec.headTargetMm - spec.headMaxMm) / spec.heightMm) * 100,
  );
  const headBandBottom = toPct(
    ((spec.crownTopMarginMm + spec.headTargetMm - spec.headMinMm) / spec.heightMm) * 100,
  );
  const hasHeadRange = Math.abs(spec.headMaxMm - spec.headMinMm) > 0.05;
  const faceWidthPct = spec.faceWidthMaxMm ? toPct((spec.faceWidthMaxMm / spec.widthMm) * 100) : undefined;
  const eyeBandTop = spec.eyeLineMaxFromBottomMm
    ? toPct(((spec.heightMm - spec.eyeLineMaxFromBottomMm) / spec.heightMm) * 100)
    : undefined;
  const eyeBandBottom = spec.eyeLineMinFromBottomMm
    ? toPct(((spec.heightMm - spec.eyeLineMinFromBottomMm) / spec.heightMm) * 100)
    : undefined;

  return (
    <div className="guide-overlay" aria-hidden="true">
      <span className="guide-line vertical center" />
      <span className="guide-line horizontal crown" style={{ top: `${crownY}%` }}>
        Crown target
      </span>
      <span className="guide-line horizontal chin" style={{ top: `${chinY}%` }}>
        Chin target
      </span>
      {hasHeadRange ? (
        <span
          className="head-range"
          style={{
            top: `${headBandTop}%`,
            height: `${Math.max(0, headBandBottom - headBandTop)}%`,
          }}
        />
      ) : null}
      {eyeBandTop !== undefined && eyeBandBottom !== undefined ? (
        <span
          className="eye-range"
          style={{
            top: `${eyeBandTop}%`,
            height: `${Math.max(0, eyeBandBottom - eyeBandTop)}%`,
          }}
        >
          Eye range
        </span>
      ) : null}
      {faceWidthPct ? (
        <span className="face-width-guide" style={{ width: `${faceWidthPct}%` }}>
          Face width
        </span>
      ) : null}
    </div>
  );
}

export default App;
