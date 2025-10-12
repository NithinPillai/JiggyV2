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




def process_image_folder(input_dir: str, output_dir: Optional[str] = None) -> str:
    """
    Process a folder of PNG images and write a CSV of pose angles.

    Args:
        input_dir: directory containing PNG frames.
        output_dir: optional directory to write CSV. If None, writes to
            ./output_csv next to this script.

    Returns:
        Path to the written CSV file.
    """
    input_dir = os.path.abspath(input_dir)


    files = [
        f for f in os.listdir(input_dir)
        if os.path.isfile(os.path.join(input_dir, f)) and f.lower().endswith('.png')
    ]
    files.sort()


    rows: List[Dict[str, float]] = []


    for fname in files:
        fpath = os.path.join(input_dir, fname)


        mp_image = mp.Image.create_from_file(fpath)


        result = detector.detect(mp_image)


        if result.pose_landmarks and len(result.pose_landmarks) > 0:
            angles = get_pose_angles(result.pose_landmarks[0])
        else:
            angles = {k: math.nan for k in [
                'right_elbow','left_elbow','right_knee','left_knee','right_shoulder','left_shoulder']}


        row = {'file': fname}
        row.update(angles)
        rows.append(row)


    df = pd.DataFrame(rows)
    folder_name = os.path.basename(os.path.dirname(input_dir))
    if output_dir is None:
        output_dir = os.path.join(os.path.dirname(__file__), "output_csv")
    os.makedirs(output_dir, exist_ok=True)
    output_csv = os.path.join(output_dir, f"{folder_name}_pose_angles.csv")
    df.to_csv(output_csv, index=False)


    return output_csv


def process_video(video_path: str, output_dir: Optional[str] = None, frame_step: int = 1) -> str:
    video_path = os.path.abspath(video_path)

    temp_dir = tempfile.mkdtemp(prefix="preprocess_frames_")
    try:
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise RuntimeError(f"Cannot open video: {video_path}")

        frame_idx = 0
        saved_idx = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            if frame_idx % frame_step == 0:
                # Save as PNG for the existing pipeline
                fname = f"frame_{saved_idx:06d}.png"
                fpath = os.path.join(temp_dir, fname)
                # frame is BGR from OpenCV
                cv2.imwrite(fpath, frame)
                saved_idx += 1
            frame_idx += 1

        cap.release()

        if saved_idx == 0:
            raise RuntimeError("No frames were extracted from the video")

        # Run the existing image-folder processor
        csv_path = process_image_folder(temp_dir, output_dir=None)

        # If caller requested a specific output_dir (e.g. next to video), move it there
        if output_dir is None:
            # by default place next to video
            output_dir = os.path.dirname(video_path)
        os.makedirs(output_dir, exist_ok=True)

        final_name = os.path.splitext(os.path.basename(video_path))[0] + "_pose_angles.csv"
        final_path = os.path.join(output_dir, final_name)
        shutil.move(csv_path, final_path)

        return final_path
    finally:
        # remove temporary frames folder
        shutil.rmtree(temp_dir, ignore_errors=True)










if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Preprocess video or image folder to CSV of pose angles")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--video", "-v", help="Path to input video file (mp4)")
    group.add_argument("--images", "-i", help="Path to folder containing PNG images to process")
    parser.add_argument("--out", "-o", help="Output directory for CSV (optional)")
    parser.add_argument("--step", "-s", type=int, default=1, help="Frame step when sampling video (default=1)")

    args = parser.parse_args()

    if args.video:
        out_dir = args.out if args.out else None
        print(f"Processing video: {args.video}")
        csv_path = process_video(args.video, output_dir=out_dir, frame_step=args.step)
        print(f"CSV written to: {csv_path}")
    else:
        out_dir = args.out if args.out else None
        print(f"Processing images folder: {args.images}")
        csv_path = process_image_folder(args.images, output_dir=out_dir)
        print(f"CSV written to: {csv_path}")



