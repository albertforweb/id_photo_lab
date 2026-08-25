import { describe, expect, it } from "vitest";
import {
  createAutoAlignedTransform,
  estimateHeadBox,
  projectSourcePoint,
} from "./alignment";
import type { DetectedFace } from "./faceDetection";
import type { LoadedPhoto } from "./imageCanvas";
import { PHOTO_SPECS } from "./specs";

const photo: LoadedPhoto = {
  img: {} as HTMLImageElement,
  url: "blob:test-photo",
  name: "portrait.jpg",
  width: 1000,
  height: 1300,
};

const display = {
  width: 700,
  height: 700,
};

function makeFace(patch: Partial<DetectedFace> = {}): DetectedFace {
  const face: DetectedFace = {
    x: 300,
    y: 350,
    width: 420,
    height: 520,
    centerX: 510,
    centerY: 610,
    score: 0.95,
    leftEye: { x: 430, y: 546 },
    rightEye: { x: 590, y: 546 },
    eyeCenter: { x: 510, y: 546 },
    ...patch,
  };

  if (patch.leftEye || patch.rightEye) {
    const leftEye = face.leftEye;
    const rightEye = face.rightEye;
    face.eyeCenter = leftEye && rightEye
      ? {
          x: (leftEye.x + rightEye.x) / 2,
          y: (leftEye.y + rightEye.y) / 2,
        }
      : undefined;
  }

  return face;
}

function specById(id: string) {
  const spec = PHOTO_SPECS.find((item) => item.id === id);

  expect(spec).toBeDefined();
  if (!spec) {
    throw new Error(`Missing spec fixture: ${id}`);
  }

  return spec;
}

describe("face auto alignment", () => {
  it("estimates an official head box beyond the raw detector box", () => {
    const face = makeFace();
    const head = estimateHeadBox(face);

    expect(head.y).toBeLessThan(face.y);
    expect(head.height).toBeGreaterThan(face.height);
    expect(head.x).toBeLessThan(face.x);
    expect(head.width).toBeGreaterThan(face.width);
  });

  it("aligns the estimated crown and chin to the selected document targets", () => {
    const spec = specById("us-passport");
    const face = makeFace();
    const transform = createAutoAlignedTransform(face, photo, spec, display);
    const head = estimateHeadBox(face);
    const crown = projectSourcePoint(photo, display, transform, {
      x: head.x + head.width / 2,
      y: head.y,
    });
    const chin = projectSourcePoint(photo, display, transform, {
      x: head.x + head.width / 2,
      y: head.y + head.height,
    });
    const targetCrownY = (spec.crownTopMarginMm / spec.heightMm) * display.height;
    const targetChinY = ((spec.crownTopMarginMm + spec.headTargetMm) / spec.heightMm) * display.height;

    expect(crown.y).toBeCloseTo(targetCrownY, 0);
    expect(chin.y).toBeCloseTo(targetChinY, 0);
  });

  it("nudges the transform enough to keep detected eyes in the spec eye band", () => {
    const spec = specById("us-passport");
    const face = makeFace({
      leftEye: { x: 430, y: 455 },
      rightEye: { x: 590, y: 455 },
    });
    const transform = createAutoAlignedTransform(face, photo, spec, display);
    const eye = projectSourcePoint(photo, display, transform, face.eyeCenter!);
    const eyeBandTop = ((spec.heightMm - spec.eyeLineMaxFromBottomMm!) / spec.heightMm) * display.height;
    const eyeBandBottom = ((spec.heightMm - spec.eyeLineMinFromBottomMm!) / spec.heightMm) * display.height;

    expect(eye.y).toBeGreaterThanOrEqual(eyeBandTop - 1);
    expect(eye.y).toBeLessThanOrEqual(eyeBandBottom + 1);
  });

  it("adds a small corrective rotation when the detected eyes are tilted", () => {
    const spec = specById("us-passport");
    const face = makeFace({
      leftEye: { x: 430, y: 530 },
      rightEye: { x: 590, y: 550 },
    });
    const transform = createAutoAlignedTransform(face, photo, spec, display);
    const leftEye = projectSourcePoint(photo, display, transform, face.leftEye!);
    const rightEye = projectSourcePoint(photo, display, transform, face.rightEye!);

    expect(transform.rotation).toBeLessThan(0);
    expect(Math.abs(leftEye.y - rightEye.y)).toBeLessThan(1);
  });
});
