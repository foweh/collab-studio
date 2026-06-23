import sys
import os
import subprocess

def main():
    if len(sys.argv) < 2:
        print("用法: python run_scenedetect.py <视频文件路径>")
        print("示例: python run_scenedetect.py video.mp4")
        return
    
    video_path = sys.argv[1]
    
    if not os.path.exists(video_path):
        print(f"错误: 文件不存在 - {video_path}")
        return
    
    base_name = os.path.splitext(os.path.basename(video_path))[0]
    stats_file = f"{base_name}.stats.csv"
    
    print(f"正在分析视频: {video_path}")
    print(f"统计文件将保存到: {stats_file}")
    print("=" * 50)
    
    result = subprocess.run([
        sys.executable, "-m", "scenedetect",
        "-i", video_path,
        "detect-content",
        "-s", stats_file,
        "list-scenes"
    ], capture_output=True, text=True)
    
    print(result.stdout)
    
    if result.stderr:
        print("\n错误信息:")
        print(result.stderr)
    
    if os.path.exists(stats_file):
        print("\n" + "=" * 50)
        print(f"✓ 分析完成！统计文件已生成: {stats_file}")
        print(f"✓ 现在可以打开 visualize.html 来查看可视化结果")

if __name__ == "__main__":
    main()