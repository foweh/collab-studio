import os
import sys
import cv2
import numpy as np
import imagehash
import json
import zipfile
from io import BytesIO
from PIL import Image
from flask import Flask, request, jsonify, send_file

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
app.config['SCREENSHOT_FOLDER'] = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'screenshots')
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['SCREENSHOT_FOLDER'], exist_ok=True)
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024

ALLOWED_EXTENSIONS = {'mp4', 'avi', 'mov', 'mkv', 'flv', 'wmv'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/')
def index():
    return send_file('visualize.html')

@app.route('/video/<filename>')
def stream_video(filename):
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    if not os.path.exists(filepath):
        return jsonify({'error': 'File not found'}), 404
    return send_file(filepath, mimetype='video/mp4', conditional=True)

@app.route('/screenshot/<filename>')
def serve_screenshot(filename):
    filepath = os.path.join(app.config['SCREENSHOT_FOLDER'], filename)
    if not os.path.exists(filepath):
        return jsonify({'error': 'Screenshot not found'}), 404
    return send_file(filepath, mimetype='image/jpeg', conditional=True)

@app.route('/upload', methods=['POST'])
def upload_file():
    try:
        if 'video' not in request.files:
            return jsonify({'error': 'No file part'}), 400
        
        file = request.files['video']
        
        if file.filename == '':
            return jsonify({'error': 'No selected file'}), 400
        
        if file and allowed_file(file.filename):
            filename = file.filename.replace('/', '_').replace('\\', '_')
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(filepath)
            
            threshold = float(request.form.get('threshold', 30))
            
            return jsonify({
                'success': True,
                'filename': filename,
                'filepath': filepath,
                'threshold': threshold,
                'algorithm': 'hash'
            })
        
        return jsonify({'error': 'Invalid file type'}), 400
    except Exception as e:
        return jsonify({'error': f'Upload failed: {str(e)}'}), 500

def detect_with_hash(filepath, threshold=10):
    cap = cv2.VideoCapture(filepath)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {filepath}")
    
    fps = cap.get(cv2.CAP_PROP_FPS)
    
    prev_hash = None
    stats_data = []
    scene_boundaries = []
    frame_num = 0
    
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        
        small_frame = cv2.resize(frame, (32, 32))
        pil_image = Image.fromarray(cv2.cvtColor(small_frame, cv2.COLOR_BGR2RGB))
        
        current_hash = imagehash.phash(pil_image)
        
        if prev_hash is not None:
            hash_diff = abs(prev_hash - current_hash)
            
            timecode = f"{int(frame_num // fps // 3600):02d}:{int((frame_num // fps) % 3600 // 60):02d}:{int((frame_num // fps) % 60):02d}.{int((frame_num % fps) / fps * 1000):03d}"
            
            stats_data.append({
                'Frame Number': str(frame_num),
                'Timecode': timecode,
                'content_val': str(hash_diff),
                'delta_edges': '0',
                'delta_hue': '0',
                'delta_lum': '0',
                'delta_sat': '0'
            })
            
            if hash_diff > threshold:
                scene_boundaries.append(frame_num)
        
        prev_hash = current_hash
        frame_num += 1
    
    cap.release()
    
    return stats_data, scene_boundaries, fps

def seek_and_read(cap, target_frame, fps, total_frames):
    """三层回退：时间定位 → 帧定位 → 顺序读取，确保截图不丢"""
    # Tier 1: 时间定位（MP4 H.264 首选）
    if fps and fps > 0:
        target_ms = (target_frame / fps) * 1000
        cap.set(cv2.CAP_PROP_POS_MSEC, target_ms)
        ret, frame = cap.read()
        if ret and frame is not None:
            return True, frame

    # Tier 2: 帧定位
    cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame)
    ret, frame = cap.read()
    if ret and frame is not None:
        return True, frame

    # Tier 3: 从头顺序读到目标帧
    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
    for _ in range(target_frame):
        ok, _ = cap.read()
        if not ok:
            break
    ret, frame = cap.read()
    if ret and frame is not None:
        return True, frame
    return False, None


def generate_scene_screenshots(filepath, scene_boundaries, fps, base_name):
    scenes = []
    last_mid_frame = 0  # 用于顺序读取时维持进度
    try:
        cap = cv2.VideoCapture(filepath)
        if not cap.isOpened():
            print(f"Error: Cannot open video for screenshots: {filepath}")
            return scenes

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        total_frames = max(total_frames, 1)
        start_frame = 0

        for boundary in scene_boundaries:
            end_frame = boundary
            mid_frame = max(0, min((start_frame + end_frame) // 2, total_frames - 1))

            ret, frame = seek_and_read(cap, mid_frame, fps, total_frames)
            last_mid_frame = mid_frame

            screenshot_name = ""
            if ret and frame is not None:
                screenshot_name = f"{base_name}_scene_{len(scenes)+1}.jpg"
                screenshot_path = os.path.join(app.config['SCREENSHOT_FOLDER'], screenshot_name)
                try:
                    cv2.imwrite(screenshot_path, frame)
                    print(f"Generated screenshot: {screenshot_path}")
                except Exception as e:
                    print(f"Failed to save screenshot: {e}")
                    screenshot_name = ""

            start_time = f"{int(start_frame // fps // 3600):02d}:{int((start_frame // fps) % 3600 // 60):02d}:{int((start_frame // fps) % 60):02d}"
            end_time = f"{int(end_frame // fps // 3600):02d}:{int((end_frame // fps) % 3600 // 60):02d}:{int((end_frame // fps) % 60):02d}"

            scenes.append({
                'scene_number': len(scenes) + 1,
                'start_frame': start_frame,
                'end_frame': end_frame,
                'mid_frame': mid_frame,
                'start_time': start_time,
                'end_time': end_time,
                'screenshot': screenshot_name
            })
            start_frame = end_frame

        # 最后一个场景（到视频末尾）
        if start_frame < total_frames - 1:
            end_frame = total_frames - 1
            mid_frame = max(0, min((start_frame + end_frame) // 2, total_frames - 1))

            ret, frame = seek_and_read(cap, mid_frame, fps, total_frames)
            last_mid_frame = mid_frame

            screenshot_name = ""
            if ret and frame is not None:
                screenshot_name = f"{base_name}_scene_{len(scenes)+1}.jpg"
                screenshot_path = os.path.join(app.config['SCREENSHOT_FOLDER'], screenshot_name)
                try:
                    cv2.imwrite(screenshot_path, frame)
                except Exception as e:
                    print(f"Failed to save screenshot: {e}")
                    screenshot_name = ""

            start_time = f"{int(start_frame // fps // 3600):02d}:{int((start_frame // fps) % 3600 // 60):02d}:{int((start_frame // fps) % 60):02d}"
            end_time = f"{int(end_frame // fps // 3600):02d}:{int((end_frame // fps) % 3600 // 60):02d}:{int((end_frame // fps) % 60):02d}"

            scenes.append({
                'scene_number': len(scenes) + 1,
                'start_frame': start_frame,
                'end_frame': end_frame,
                'mid_frame': mid_frame,
                'start_time': start_time,
                'end_time': end_time,
                'screenshot': screenshot_name
            })

        cap.release()
        print(f"Screenshots generated: {sum(1 for s in scenes if s.get('screenshot'))}/{len(scenes)}")

    except Exception as e:
        print(f"Screenshot generation error: {e}")
        import traceback
        traceback.print_exc()

    return scenes

@app.route('/analyze', methods=['POST'])
def analyze_video():
    try:
        data = request.get_json()
        filepath = data.get('filepath')
        threshold = data.get('threshold', 30)
        
        if not filepath:
            return jsonify({'error': 'Filepath is required'}), 400
        
        if not os.path.exists(filepath):
            return jsonify({'error': 'File not found'}), 400
        
        base_name = os.path.splitext(os.path.basename(filepath))[0]
        print(f"Analyzing: {base_name}")
        print(f"Threshold: {threshold}")
        
        stats_data, scene_boundaries, fps = detect_with_hash(filepath, threshold)
        print(f"Detected {len(scene_boundaries)} scene boundaries")
        
        scenes = generate_scene_screenshots(filepath, scene_boundaries, fps, base_name)
        print(f"Generated {len(scenes)} scene screenshots")
        
        return jsonify({
            'success': True,
            'stats': stats_data,
            'scenes': scenes,
            'algorithm': 'hash',
            'filename': base_name,
            'fps': fps
        })
    
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Analysis error: {str(e)}'}), 500

@app.route('/export', methods=['POST'])
def export_scenes():
    try:
        data = request.get_json()
        base_name = data.get('filename')
        
        if not base_name:
            return jsonify({'error': 'Filename is required'}), 400
        
        scene_files = [f for f in os.listdir(app.config['SCREENSHOT_FOLDER']) if f.startswith(base_name) and f.endswith('.jpg')]
        
        memory_file = BytesIO()
        with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zf:
            for scene_file in scene_files:
                filepath = os.path.join(app.config['SCREENSHOT_FOLDER'], scene_file)
                if os.path.exists(filepath):
                    zf.write(filepath, scene_file)
            
            scene_info = {
                'filename': base_name,
                'total_scenes': len(scene_files),
                'scenes': []
            }
            
            for i in range(1, len(scene_files) + 1):
                scene_info['scenes'].append({
                    'scene_number': i,
                    'screenshot': f"{base_name}_scene_{i}.jpg"
                })
            
            zf.writestr('scene_info.json', json.dumps(scene_info, ensure_ascii=False, indent=2))
        
        memory_file.seek(0)
        
        return send_file(
            memory_file,
            mimetype='application/zip',
            download_name=f'{base_name}_scenes.zip',
            as_attachment=True
        )
    
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Export error: {str(e)}'}), 500

@app.route('/delete', methods=['POST'])
def delete_file():
    data = request.get_json()
    filepath = data.get('filepath')
    
    try:
        if os.path.exists(filepath):
            os.remove(filepath)
        
        base_name = os.path.splitext(os.path.basename(filepath))[0]
        
        for f in os.listdir(app.config['SCREENSHOT_FOLDER']):
            if f.startswith(base_name):
                os.remove(os.path.join(app.config['SCREENSHOT_FOLDER'], f))
        
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    print("Starting Scene Detection Web Server...")
    print("Server running at: http://localhost:5000")
    app.run(host='0.0.0.0', port=5000, debug=False)