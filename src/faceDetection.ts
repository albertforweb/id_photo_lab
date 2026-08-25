import { FaceDetector, FilesetResolver, type Detection } from "@mediapipe/tasks-vision";

export type DetectedFace = {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  score: number;
  leftEye?: { x: number; y: number };
  rightEye?: { x: number; y: number };
  eyeCenter?: { x: number; y: number };
  nose?: { x: number; y: number };
  mouth?: { x: number; y: number };
};

let detectorPromise: Promise<FaceDetector> | null = null;

function publicAssetUrl(path: string): string {
  const base = new URL(import.meta.env.BASE_URL, window.location.href);
  return new URL(path.replace(/^\//, ""), base).toString();
}

async function getFaceDetector(): Promise<FaceDetector> {
  if (!detectorPromise) {
    detectorPromise = FilesetResolver.forVisionTasks(publicAssetUrl("mediapipe/wasm")).then((vision) =>
      FaceDetector.createFromOptions(vision, {
        baseOptions: {
          delegate: "CPU",
          modelAssetPath: publicAssetUrl("mediapipe/models/blaze_face_short_range.tflite"),
        },
        minDetectionConfidence: 0.55,
        minSuppressionThreshold: 0.3,
        runningMode: "IMAGE",
      }),
    );
  }

  return detectorPromise;
}

function detectionScore(detection: Detection): number {
  return detection.categories[0]?.score ?? 0;
}

function toImagePoint(keypoint: Detection["keypoints"][number] | undefined, imageWidth: number, imageHeight: number) {
  return keypoint
    ? { x: keypoint.x * imageWidth, y: keypoint.y * imageHeight }
    : undefined;
}

function keypointByLabelOrIndex(detection: Detection, labels: string[], fallbackIndex: number) {
  const labeledKeypoint = detection.keypoints.find((keypoint) =>
    labels.includes(keypoint.label?.toLowerCase() ?? ""),
  );

  return labeledKeypoint ?? detection.keypoints[fallbackIndex];
}

function toDetectedFace(detection: Detection, imageWidth: number, imageHeight: number): DetectedFace | null {
  const box = detection.boundingBox;
  if (!box || box.width <= 0 || box.height <= 0) {
    return null;
  }

  const firstEye = toImagePoint(
    keypointByLabelOrIndex(detection, ["left eye", "left_eye", "right eye", "right_eye"], 0),
    imageWidth,
    imageHeight,
  );
  const secondEye = toImagePoint(detection.keypoints[1], imageWidth, imageHeight);
  const eyePoints = [firstEye, secondEye]
    .filter((point): point is { x: number; y: number } => Boolean(point))
    .sort((a, b) => a.x - b.x);
  const leftEye = eyePoints[0];
  const rightEye = eyePoints[1];
  const eyeCenter = leftEye && rightEye
    ? {
        x: (leftEye.x + rightEye.x) / 2,
        y: (leftEye.y + rightEye.y) / 2,
      }
    : undefined;
  const nose = toImagePoint(
    keypointByLabelOrIndex(detection, ["nose tip", "nose_tip", "nose"], 2),
    imageWidth,
    imageHeight,
  );
  const mouth = toImagePoint(
    keypointByLabelOrIndex(detection, ["mouth center", "mouth_center", "mouth"], 3),
    imageWidth,
    imageHeight,
  );

  return {
    x: box.originX,
    y: box.originY,
    width: box.width,
    height: box.height,
    centerX: box.originX + box.width / 2,
    centerY: box.originY + box.height / 2,
    score: detectionScore(detection),
    leftEye,
    rightEye,
    eyeCenter,
    nose,
    mouth,
  };
}

export async function detectPrimaryFace(image: HTMLImageElement): Promise<DetectedFace | null> {
  const detector = await getFaceDetector();
  const result = detector.detect(image);
  const faces = result.detections
    .map((detection) => toDetectedFace(detection, image.naturalWidth, image.naturalHeight))
    .filter((face): face is DetectedFace => Boolean(face));

  if (faces.length === 0) {
    return null;
  }

  return faces.sort((a, b) => (b.width * b.height * b.score) - (a.width * a.height * a.score))[0];
}
