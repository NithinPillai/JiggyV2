from weakref import ref
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
from mediapipe.framework.formats import landmark_pb2
from mediapipe import solutions
import cv2
import numpy as np
import sys
import pickle
import os
import pandas as pd
import math
from typing import Optional, List, Dict
import tempfile
import shutil
import argparse


base_options = python.BaseOptions(model_asset_path = os.path.join(os.path.dirname(__file__), "pose_landmarker_heavy.task"))
options = vision.PoseLandmarkerOptions(
   base_options=base_options,
   output_segmentation_masks=True,  # Disable unused feature
   num_poses=1)  # Limit to one pose
detector = vision.PoseLandmarker.create_from_options(options)


def calculate_angle(a, b, c):
    a = np.array(a)
    b = np.array(b)
    c = np.array(c)


    ba = a - b
    bc = c - b


    cosine_angle = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc))
    angle = np.arccos(np.clip(cosine_angle, -1.0, 1.0))
    return np.degrees(angle)




def get_pose_angles(landmarks):
    points = np.array([[lmk.x, lmk.y, lmk.z, lmk.visibility] for lmk in landmarks])


    def safe_angle(idx1, idx2, idx3):
        if points[idx1][3] < 0.6 or points[idx2][3] < 0.6 or points[idx3][3] < 0.6:
            return 181
        return calculate_angle([points[idx1][0], points[idx1][1]],
                               [points[idx2][0], points[idx2][1]],
                               [points[idx3][0], points[idx3][1]])


    return {
        'right_elbow': safe_angle(11, 13, 15),      # Right shoulder, elbow, wrist
        'left_elbow': safe_angle(12, 14, 16),       # Left shoulder, elbow, wrist
        'right_knee': safe_angle(23, 25, 27),       # Right hip, knee, ankle
        'left_knee': safe_angle(24, 26, 28),        # Left hip, knee, ankle
        'right_shoulder': safe_angle(13, 11, 23),   # Right elbow, shoulder, hip
        'left_shoulder': safe_angle(14, 12, 24),    # Left elbow, shoulder, hip
    }




def draw_landmarks_on_image(rgb_image, detection_result):
    pose_landmarks_list = detection_result.pose_landmarks
    # Convert to BGR before creating a copy for drawing
    bgr_image = cv2.cvtColor(rgb_image, cv2.COLOR_RGB2BGR)
    annotated_image = np.copy(bgr_image)


    # Loop through the detected poses to visualize.
    for idx in range(len(pose_landmarks_list)):
        pose_landmarks = pose_landmarks_list[idx]


        # Draw the pose landmarks.
        pose_landmarks_proto = landmark_pb2.NormalizedLandmarkList()
        pose_landmarks_proto.landmark.extend([
            landmark_pb2.NormalizedLandmark(x=landmark.x, y=landmark.y, z=landmark.z) for landmark in pose_landmarks
        ])
        solutions.drawing_utils.draw_landmarks(
            annotated_image,
            pose_landmarks_proto,
            solutions.pose.POSE_CONNECTIONS,
            solutions.drawing_styles.get_default_pose_landmarks_style())
    return annotated_image  # No need to convert again as it's already in BGR


def process_video(video_path: str, output_dir: Optional[str] = None, show: bool = False) -> str:
    video_path = os.path.abspath(video_path)
    video_path = os.path.abspath(video_path)

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 0
    frame_idx = 0
    rows = []

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            # timestamp in milliseconds
            time_ms = int((frame_idx / fps) * 1000) if fps > 0 else 0
            # convert BGR to RGB for Mediapipe
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            # Wrap numpy array in Mediapipe Image with image_format and data
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            try:
                detection_result = detector.detect(mp_image)
            except Exception as e:
                # if detection fails, log and continue
                print(f"Warning: detection failed on frame {frame_idx}: {e}", file=sys.stderr)
                detection_result = None

            angles = {
                'right_elbow': 181,
                'left_elbow': 181,
                'right_knee': 181,
                'left_knee': 181,
                'right_shoulder': 181,
                'left_shoulder': 181,
            }

            if detection_result is not None and getattr(detection_result, 'pose_landmarks', None):
                pose_list = detection_result.pose_landmarks
                if len(pose_list) > 0:
                    # take the first detected pose
                    landmarks = pose_list[0]
                    angles = get_pose_angles(landmarks)

            # If requested, draw landmarks on the frame and display it.
            if show and detection_result is not None and getattr(detection_result, 'pose_landmarks', None):
                try:
                    # draw_landmarks_on_image expects an RGB image; we already have `rgb` above
                    annotated = draw_landmarks_on_image(rgb, detection_result)
                    # annotated is in BGR color space which OpenCV expects for imshow
                    # Compute wait time from video fps (ms). Ensure at least 1 ms.
                    wait_ms = max(1, int(1000 / fps)) if fps and fps > 0 else 1
                    cv2.imshow('Annotated Pose', annotated)
                    key = cv2.waitKey(wait_ms) & 0xFF
                    # Press 'q' to quit early
                    if key == ord('q'):
                        print('User requested quit, stopping playback.')
                        break
                except Exception as e:
                    print(f"Warning: failed to draw/display landmarks on frame {frame_idx}: {e}", file=sys.stderr)

            row = {
                'frame': frame_idx,
                'time_ms': time_ms,
                'right_elbow': angles['right_elbow'],
                'left_elbow': angles['left_elbow'],
                'right_knee': angles['right_knee'],
                'left_knee': angles['left_knee'],
                'right_shoulder': angles['right_shoulder'],
                'left_shoulder': angles['left_shoulder'],
            }
            rows.append(row)

            frame_idx += 1

        cap.release()

        if show:
            try:
                cv2.destroyAllWindows()
            except Exception:
                pass

        if len(rows) == 0:
            raise RuntimeError("No frames were extracted from the video")

        # Build DataFrame and write CSV
        df = pd.DataFrame(rows)

        if output_dir is None:
            output_dir = os.path.dirname(video_path)
        os.makedirs(output_dir, exist_ok=True)

        final_name = os.path.splitext(os.path.basename(video_path))[0] + "_pose_angles.csv"
        final_path = os.path.join(output_dir, final_name)
        df.to_csv(final_path, index=False)

        return final_path
    finally:
        try:
            cap.release()
        except Exception:
            pass







if __name__ == "__main__":
    csv_path = process_video('/Users/nithinpillai/Downloads/video_4.mp4', output_dir='/Users/nithinpillai/workspace/JiggyV2/cv/preprocessing/csv', show=True)
    print(f"CSV written to: {csv_path}")



