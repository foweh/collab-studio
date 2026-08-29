package com.collabstudio;

import android.content.res.AssetManager;
import android.util.Log;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Node.js 后台服务
 * 从 assets/nodejs-project/ 复制服务端代码到内部存储，启动 Node.js
 */
public class NodeService {

    private static final String TAG = "NodeService";
    private static final String NODE_PROJECT = "nodejs-project";
    private Thread nodeThread;
    private boolean running = false;

    public interface NodeStartCallback {
        void onStarted();
    }

    /**
     * 启动 Node.js 服务
     */
    public void startNodeServer(final android.content.Context context, final NodeStartCallback callback) {
        if (running) return;
        running = true;

        new Thread(() -> {
            try {
                // 1. 将 assets/nodejs-project/ 复制到内部存储
                File dataDir = new File(context.getFilesDir(), NODE_PROJECT);
                copyAssets(context.getAssets(), NODE_PROJECT, dataDir);

                // 2. 设置环境变量
                File nodeDir = new File(dataDir, "nodejs");
                if (!nodeDir.exists()) nodeDir.mkdirs();

                // 3. 启动 Node.js
                // 使用 nodejs-mobile-cordova 的 NodeJS 类
                // 此项目使用 JNI 加载 libnode.so
                startNodeEngine(context, dataDir.getAbsolutePath());

                Log.i(TAG, "Node.js 服务已启动");
                if (callback != null) {
                    callback.onStarted();
                }
            } catch (Exception e) {
                Log.e(TAG, "Node.js 启动失败", e);
                running = false;
            }
        }).start();
    }

    /**
     * 使用 nodejs-mobile-cordova 的 JNI 桥接启动 Node.js
     */
    private void startNodeEngine(android.content.Context context, String projectPath) {
        try {
            // 加载本地库
            System.loadLibrary("node");

            // 设置 Node.js 参数
            String[] args = {
                    "node",
                    projectPath + "/server.js",
                    "--port", "3000",
                    "--data-dir", context.getFilesDir().getAbsolutePath() + "/data"
            };

            // 调用 JNI 启动 Node.js
            // nodejs-mobile-cordova 的 NodeJS.java 提供 startNodeWithArgs
            com.janeasystems.cdvnodejsmobile.NodeJS.startNodeWithArgs(args);
        } catch (UnsatisfiedLinkError e) {
            Log.e(TAG, "无法加载 libnode.so", e);
        }
    }

    /**
     * 停止 Node.js 服务
     */
    public void stopNodeServer() {
        running = false;
        if (nodeThread != null) {
            nodeThread.interrupt();
            nodeThread = null;
        }
    }

    /**
     * 递归复制 assets 目录到内部存储
     */
    private void copyAssets(AssetManager assetManager, String assetPath, File outputDir) {
        try {
            String[] files = assetManager.list(assetPath);
            if (files == null) return;

            if (!outputDir.exists()) {
                outputDir.mkdirs();
            }

            for (String file : files) {
                String subPath = assetPath + "/" + file;
                try {
                    InputStream is = assetManager.open(subPath);
                    // 这是一个文件
                    File outFile = new File(outputDir, file);
                    OutputStream os = new FileOutputStream(outFile);
                    byte[] buffer = new byte[8192];
                    int len;
                    while ((len = is.read(buffer)) != -1) {
                        os.write(buffer, 0, len);
                    }
                    os.close();
                    is.close();
                } catch (java.io.FileNotFoundException e) {
                    // 这是一个目录，递归
                    copyAssets(assetManager, subPath, new File(outputDir, file));
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "复制 assets 失败: " + assetPath, e);
        }
    }
}
