import type { CSSProperties } from "react";
import type { DetectedFace } from "./faceDetection";
import { clamp, type DisplaySize, type ImageTransform, type LoadedPhoto } from "./imageCanvas";
import type { PhotoSpec } from "./specs";

const ESTIMATED_CROWN_ABOVE_FACE_BOX_RATIO = 0.18;
const ESTIMATED_CHIN_FROM_FACE_BOX_TOP_RATIO = 0.98;
const ESTIMATED_HEAD_SIDE_MARGIN_RATIO = 0.08;

export type ProjectedFaceOverlay = {
  faceBox: CSSProperties;
  headBox: CSSProperties;
  confidence: string;
  leftEye?: CSSProperties;
  rightEye?: CSSProperties;
  eyeLine?: CSSProperties;
  center?: CSSProperties;
};

type SourcePoint = {
  x: number;
  y: number;
};

type SourceBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function estimateHeadBox(face: DetectedFace): SourceBox {
  const crownY = face.y - face.height * ESTIMATED_CROWN_ABOVE_FACE_BOX_RATIO;
  const chinY = face.y + face.height * ESTIMATED_CHIN_FROM_FACE_BOX_TOP_RATIO;
  const sideMargin = face.width * ESTIMATED_HEAD_SIDE_MARGIN_RATIO;

  return {
    x: face.x - sideMargin,
    y: crownY,
    width: face.width + sideMargin * 2,
    height: chinY - crownY,
  };
}

function getBoxCorners(box: SourceBox): SourcePoint[] {
  return [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x + box.width, y: box.y + box.height },
    { x: box.x, y: box.y + box.height },
  ];
}

function getBoundingStyle(points: SourcePoint[]): CSSProperties {
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));

  return {
    left: `${minX}px`,
    top: `${minY}px`,
    width: `${maxX - minX}px`,
    height: `${maxY - minY}px`,
  };
}

function getPointOffset(
  photo: LoadedPhoto,
  baseScale: number,
  zoom: number,
  rotation: number,
  point: SourcePoint,
): SourcePoint {
  const zoomScale = baseScale * zoom;
  const localX = (point.x - photo.width / 2) * zoomScale;
  const localY = (point.y - photo.height / 2) * zoomScale;
  const angle = (rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return {
    x: localX * cos - localY * sin,
    y: localX * sin + localY * cos,
  };
}

export function projectSourcePoint(
  photo: LoadedPhoto,
  display: DisplaySize,
  transform: ImageTransform,
  point: SourcePoint,
): SourcePoint {
  const baseScale = Math.max(display.width / photo.width, display.height / photo.height);
  const flipX = transform.flipX ? -1 : 1;
  const flipY = transform.flipY ? -1 : 1;
  const offset = getPointOffset(
    photo,
    baseScale,
    transform.zoom,
    transform.rotation,
    {
      x: photo.width / 2 + (point.x - photo.width / 2) * flipX,
      y: photo.height / 2 + (point.y - photo.height / 2) * flipY,
    },
  );

  return {
    x: display.width / 2 + transform.x + offset.x,
    y: display.height / 2 + transform.y + offset.y,
  };
}

export function projectDetectedFace(
  face: DetectedFace,
  photo: LoadedPhoto,
  display: DisplaySize,
  transform: ImageTransform,
): ProjectedFaceOverlay {
  const faceBox = {
    x: face.x,
    y: face.y,
    width: face.width,
    height: face.height,
  };
  const headBox = estimateHeadBox(face);
  const facePoints = getBoxCorners(faceBox).map((point) => projectSourcePoint(photo, display, transform, point));
  const headPoints = getBoxCorners(headBox).map((point) => projectSourcePoint(photo, display, transform, point));
  const leftEye = face.leftEye ? projectSourcePoint(photo, display, transform, face.leftEye) : undefined;
  const rightEye = face.rightEye ? projectSourcePoint(photo, display, transform, face.rightEye) : undefined;
  const eyeCenter = face.eyeCenter ? projectSourcePoint(photo, display, transform, face.eyeCenter) : undefined;
  const faceCenter = projectSourcePoint(photo, display, transform, { x: face.centerX, y: face.centerY });

  return {
    faceBox: getBoundingStyle(facePoints),
    headBox: getBoundingStyle(headPoints),
    confidence: `${Math.round(face.score * 100)}%`,
    leftEye: leftEye ? { left: `${leftEye.x}px`, top: `${leftEye.y}px` } : undefined,
    rightEye: rightEye ? { left: `${rightEye.x}px`, top: `${rightEye.y}px` } : undefined,
    eyeLine: eyeCenter
      ? {
          left: `${Math.min(...headPoints.map((point) => point.x))}px`,
          top: `${eyeCenter.y}px`,
          width: `${Math.max(...headPoints.map((point) => point.x)) - Math.min(...headPoints.map((point) => point.x))}px`,
        }
      : undefined,
    center: { left: `${faceCenter.x}px`, top: `${faceCenter.y}px` },
  };
}

function getEyeTargetBand(spec: PhotoSpec, display: DisplaySize): { top: number; bottom: number } | null {
  if (spec.eyeLineMinFromBottomMm === undefined || spec.eyeLineMaxFromBottomMm === undefined) {
    return null;
  }

  const top = ((spec.heightMm - spec.eyeLineMaxFromBottomMm) / spec.heightMm) * display.height;
  const bottom = ((spec.heightMm - spec.eyeLineMinFromBottomMm) / spec.heightMm) * display.height;

  return {
    top: Math.min(top, bottom),
    bottom: Math.max(top, bottom),
  };
}

function getEyeLevelRotation(face: DetectedFace): number {
  if (!face.leftEye || !face.rightEye) {
    return 0;
  }

  const deltaX = face.rightEye.x - face.leftEye.x;
  const deltaY = face.rightEye.y - face.leftEye.y;

  if (Math.abs(deltaX) < 1) {
    return 0;
  }

  return Number(clamp(-(Math.atan2(deltaY, deltaX) * 180) / Math.PI, -10, 10).toFixed(2));
}

export function createAutoAlignedTransform(
  face: DetectedFace,
  photo: LoadedPhoto,
  spec: PhotoSpec,
  display: DisplaySize,
): ImageTransform {
  const baseScale = Math.max(display.width / photo.width, display.height / photo.height);
  const estimatedHead = estimateHeadBox(face);
  const targetHeadHeightPx = (spec.headTargetMm / spec.heightMm) * display.height;
  const zoom = Number(clamp(targetHeadHeightPx / Math.max(1, estimatedHead.height * baseScale), 0.55, 3.2).toFixed(3));
  const rotation = getEyeLevelRotation(face);
  const headCenter = {
    x: estimatedHead.x + estimatedHead.width / 2,
    y: estimatedHead.y + estimatedHead.height / 2,
  };
  const headOffset = getPointOffset(photo, baseScale, zoom, rotation, headCenter);
  const targetHeadCenterY = ((spec.crownTopMarginMm + spec.headTargetMm / 2) / spec.heightMm) * display.height;
  let y = targetHeadCenterY - display.height / 2 - headOffset.y;

  if (face.eyeCenter) {
    const eyeBand = getEyeTargetBand(spec, display);
    if (eyeBand) {
      const eyeOffset = getPointOffset(photo, baseScale, zoom, rotation, face.eyeCenter);
      const projectedEyeY = display.height / 2 + y + eyeOffset.y;

      if (projectedEyeY < eyeBand.top) {
        y += eyeBand.top - projectedEyeY;
      } else if (projectedEyeY > eyeBand.bottom) {
        y += eyeBand.bottom - projectedEyeY;
      }
    }
  }

  const horizontalAnchor = face.eyeCenter ?? { x: face.centerX, y: face.centerY };
  const horizontalOffset = getPointOffset(photo, baseScale, zoom, rotation, horizontalAnchor);

  return {
    x: Number((-horizontalOffset.x).toFixed(1)),
    y: Number(y.toFixed(1)),
    zoom,
    rotation,
    flipX: false,
    flipY: false,
  };
}
