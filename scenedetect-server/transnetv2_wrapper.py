import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'TransNetV2', 'inference-pytorch'))

import torch
import numpy as np
import cv2
from transnetv2_pytorch import TransNetV2 as TransNetV2Model


class TransNetV2:
    def __init__(self):
        self.model = TransNetV2Model()
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.model.to(self.device)
        self.model.eval()
        
    def load_weights(self, weights_path):
        try:
            state_dict = torch.load(weights_path, map_location=self.device)
            self.model.load_state_dict(state_dict)
            print(f"[TransNetV2] Weights loaded from {weights_path}")
        except Exception as e:
            print(f"[TransNetV2] Failed to load weights: {e}")
            
    def predict_video(self, video_path):
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise ValueError(f"Cannot open video: {video_path}")
        
        frames = []
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            frame = cv2.resize(frame, (48, 27))
            frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            frames.append(frame)
        cap.release()
        
        if len(frames) == 0:
            raise ValueError("No frames extracted from video")
        
        frames = np.array(frames, dtype=np.uint8)
        
        # Process in batches
        batch_size = 100
        predictions = []
        
        for i in range(0, len(frames), batch_size):
            batch_frames = frames[i:i+batch_size]
            
            # Pad if necessary
            if len(batch_frames) < 100:
                padding = 100 - len(batch_frames)
                batch_frames = np.pad(batch_frames, ((0, padding), (0, 0), (0, 0), (0, 0)), mode='edge')
            
            # Convert to tensor
            batch_tensor = torch.from_numpy(batch_frames).unsqueeze(0).to(self.device)
            
            with torch.no_grad():
                pred = self.model(batch_tensor)
                pred = torch.sigmoid(pred).cpu().numpy()
                predictions.append(pred[0, :len(batch_frames)])
        
        predictions = np.concatenate(predictions, axis=0)
        
        # Find scene boundaries
        scenes = []
        threshold = 0.5
        for i in range(1, len(predictions)):
            if predictions[i] > threshold and predictions[i-1] <= threshold:
                scenes.append(i)
        
        return scenes, predictions