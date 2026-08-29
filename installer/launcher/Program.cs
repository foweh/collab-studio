// ============================================
// Collab Studio 启动器
// - 检查 Node.js
// - 检查 node_modules
// - 启动 server.js
// - 关闭时一并停止子进程
// ============================================

using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Windows.Forms;

namespace CollabStudioLauncher
{
    internal static class Program
    {
        [STAThread]
        static int Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new LauncherForm());
            return 0;
        }
    }

    public class LauncherForm : Form
    {
        private Process serverProcess;
        private TextBox logBox;
        private Button startBtn;
        private Button stopBtn;
        private Button openBtn;
        private Label statusLbl;
        private string installDir = "";
        private string logFile = "";

        private void FileLog(string msg)
        {
            try
            {
                if (string.IsNullOrEmpty(logFile)) return;
                var line = "[" + DateTime.Now.ToString("HH:mm:ss") + "] " + msg + Environment.NewLine;
                File.AppendAllText(logFile, line);
            }
            catch { }
        }

        public LauncherForm()
        {
            installDir = AppContext.BaseDirectory;
            logFile = Path.Combine(installDir, "launcher.log");
            Text = "🎬 Collab Studio 协作工作室";
            Size = new System.Drawing.Size(720, 500);
            StartPosition = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.Sizable;
            MinimumSize = new System.Drawing.Size(600, 400);

            // 状态栏
            statusLbl = new Label
            {
                Dock = DockStyle.Top,
                Height = 32,
                Text = "  准备就绪",
                TextAlign = System.Drawing.ContentAlignment.MiddleLeft,
                BackColor = System.Drawing.Color.FromArgb(45, 50, 60),
                ForeColor = System.Drawing.Color.White,
                Font = new System.Drawing.Font("Microsoft YaHei UI", 10)
            };
            Controls.Add(statusLbl);

            // 按钮区
            var btnPanel = new FlowLayoutPanel
            {
                Dock = DockStyle.Top,
                Height = 50,
                Padding = new Padding(8)
            };
            startBtn = new Button { Text = "▶ 启动服务", Width = 110, Height = 32 };
            stopBtn = new Button { Text = "■ 停止服务", Width = 110, Height = 32, Enabled = false };
            openBtn = new Button { Text = "🌐 打开浏览器", Width = 130, Height = 32, Enabled = false };
            var autoStartChk = new CheckBox
            {
                Text = "启动后自动打开浏览器",
                Checked = true,
                AutoSize = true,
                Margin = new Padding(20, 8, 0, 0)
            };
            btnPanel.Controls.AddRange(new Control[] { startBtn, stopBtn, openBtn, autoStartChk });
            Controls.Add(btnPanel);

            // 日志框
            logBox = new TextBox
            {
                Dock = DockStyle.Fill,
                Multiline = true,
                ScrollBars = ScrollBars.Both,
                ReadOnly = true,
                BackColor = System.Drawing.Color.FromArgb(30, 30, 30),
                ForeColor = System.Drawing.Color.FromArgb(220, 220, 220),
                Font = new System.Drawing.Font("Consolas", 9),
                WordWrap = false
            };
            Controls.Add(logBox);

            // 事件
            startBtn.Click += (s, e) => StartServer(autoStartChk.Checked);
            stopBtn.Click += (s, e) => StopServer();
            openBtn.Click += (s, e) => OpenBrowser();
            FormClosing += (s, e) => { StopServer(); };

            Shown += (s, e) =>
            {
                AppendLog("Collab Studio 启动器 v1.0");
                AppendLog("安装目录: " + installDir);
                AppendLog("═══════════════════════════════════");
                StartServer(autoStartChk.Checked);
            };
        }

        private string FindNodeExe()
        {
            // 0) 优先查找应用目录内置的 node.exe
            var bundledNode = Path.Combine(installDir, "node.exe");
            if (File.Exists(bundledNode)) return bundledNode;

            // 1) 查注册表
            string[] regPaths =
            {
                @"HKLM\SOFTWARE\Node.js",
                @"HKLM\SOFTWARE\WOW6432Node\Node.js",
                @"HKCU\SOFTWARE\Node.js"
            };
            foreach (var key in regPaths)
            {
                try
                {
                    using (var rk = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(
                        key.Replace("HKLM\\", "").Replace("HKCU\\", "")))
                    {
                        if (rk != null)
                        {
                            var path = rk.GetValue("InstallPath") as string;
                            if (!string.IsNullOrEmpty(path))
                            {
                                var nodeExe = Path.Combine(path, "node.exe");
                                if (File.Exists(nodeExe)) return nodeExe;
                            }
                        }
                    }
                }
                catch { }
            }
            // 2) 查 PATH
            var pathEnv = Environment.GetEnvironmentVariable("PATH");
            if (pathEnv == null) pathEnv = "";
            foreach (var dir in pathEnv.Split(Path.PathSeparator))
            {
                try
                {
                    var nodeExe = Path.Combine(dir, "node.exe");
                    if (File.Exists(nodeExe)) return nodeExe;
                }
                catch { }
            }
            // 3) 常见路径
            string[] commonPaths =
            {
                @"C:\Program Files\nodejs\node.exe",
                @"C:\Program Files (x86)\nodejs\node.exe",
                @"D:\node\node.exe"
            };
            foreach (var p in commonPaths)
                if (File.Exists(p)) return p;
            return null;
        }

        private void StartServer(bool autoOpen)
        {
            FileLog("StartServer called");
            if (serverProcess != null && !serverProcess.HasExited)
            {
                AppendLog("⚠ 服务已在运行");
                return;
            }

            var nodeExe = FindNodeExe();
            FileLog("nodeExe=" + (nodeExe ?? "null"));
            if (nodeExe == null)
            {
                AppendLog("❌ 未找到 Node.js！");
                AppendLog("请先安装 Node.js 18+: https://nodejs.org");
                SetStatus("❌ 未找到 Node.js", System.Drawing.Color.FromArgb(180, 50, 50));
                var result = MessageBox.Show(
                    "未检测到 Node.js！\n\n是否打开 Node.js 官方下载页？",
                    "Collab Studio",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Warning);
                if (result == DialogResult.Yes)
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = "https://nodejs.org/zh-cn/download/",
                        UseShellExecute = true
                    });
                }
                return;
            }
            AppendLog("✓ 找到 Node.js: " + nodeExe);

            var serverJs = Path.Combine(installDir, "server.js");
            FileLog("serverJs=" + serverJs + " exists=" + File.Exists(serverJs));
            if (!File.Exists(serverJs))
            {
                AppendLog("❌ 找不到 server.js: " + serverJs);
                SetStatus("❌ 安装文件缺失", System.Drawing.Color.FromArgb(180, 50, 50));
                return;
            }

            // 检查 node_modules
            var nodeModules = Path.Combine(installDir, "node_modules");
            if (!Directory.Exists(nodeModules))
            {
                AppendLog("⚠ node_modules 不存在，正在安装依赖...");
                SetStatus("⏳ 首次运行，正在安装依赖（需联网）...", System.Drawing.Color.FromArgb(180, 140, 50));
                if (!InstallDependencies(nodeExe))
                {
                    AppendLog("❌ 依赖安装失败");
                    SetStatus("❌ 依赖安装失败", System.Drawing.Color.FromArgb(180, 50, 50));
                    return;
                }
                AppendLog("✓ 依赖安装完成");
            }

            try
            {
                FileLog("Starting node: " + nodeExe + " \"" + serverJs + "\" cwd=" + installDir);
                serverProcess = new Process
                {
                    StartInfo = new ProcessStartInfo
                    {
                        FileName = nodeExe,
                        Arguments = "\"" + serverJs + "\"",
                        WorkingDirectory = installDir,
                        UseShellExecute = false,
                        RedirectStandardOutput = true,
                        RedirectStandardError = true,
                        CreateNoWindow = true
                    },
                    EnableRaisingEvents = true
                };
                serverProcess.OutputDataReceived += (s, e) => { if (e.Data != null) AppendLog(e.Data); };
                serverProcess.ErrorDataReceived += (s, e) => { if (e.Data != null) AppendLog("[err] " + e.Data); };
                serverProcess.Exited += (s, e) =>
                {
                    BeginInvoke(new Action(() =>
                    {
                        AppendLog("ℹ 服务已停止");
                        SetStatus("○ 服务已停止", System.Drawing.Color.Gray);
                        startBtn.Enabled = true;
                        stopBtn.Enabled = false;
                        openBtn.Enabled = false;
                        serverProcess = null;
                    }));
                };
                serverProcess.Start();
                serverProcess.BeginOutputReadLine();
                serverProcess.BeginErrorReadLine();

                AppendLog("✓ 服务已启动 (PID " + serverProcess.Id + ")");
                SetStatus("🟢 服务运行中 (PID " + serverProcess.Id + ")", System.Drawing.Color.FromArgb(50, 160, 80));
                startBtn.Enabled = false;
                stopBtn.Enabled = true;
                openBtn.Enabled = true;

                if (autoOpen)
                {
                    Thread.Sleep(2000);
                    OpenBrowser();
                }
            }
            catch (Exception ex)
            {
                FileLog("Exception in StartServer: " + ex.ToString());
                AppendLog("❌ 启动失败: " + ex.Message);
                SetStatus("❌ 启动失败", System.Drawing.Color.FromArgb(180, 50, 50));
            }
        }

        private bool InstallDependencies(string nodeExe)
        {
            try
            {
                var nodeDir = Path.GetDirectoryName(nodeExe);
                if (nodeDir == null)
                {
                    AppendLog("❌ 无法获取 node.exe 目录");
                    return false;
                }
                var npmCmd = Path.Combine(nodeDir, "npm.cmd");
                if (!File.Exists(npmCmd))
                {
                    AppendLog("❌ 找不到 npm.cmd");
                    return false;
                }
                var p = Process.Start(new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = "/c \"\"" + npmCmd + "\" install --omit=dev\"",
                    WorkingDirectory = installDir,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true
                });
                if (p == null) return false;
                p.OutputDataReceived += (s, e) => { if (e.Data != null) BeginInvoke(new Action(() => AppendLog("  " + e.Data))); };
                p.ErrorDataReceived += (s, e) => { if (e.Data != null) BeginInvoke(new Action(() => AppendLog("  " + e.Data))); };
                p.BeginOutputReadLine();
                p.BeginErrorReadLine();
                p.WaitForExit();
                return p.ExitCode == 0 && Directory.Exists(Path.Combine(installDir, "node_modules"));
            }
            catch (Exception ex)
            {
                AppendLog("❌ npm install 失败: " + ex.Message);
                return false;
            }
        }

        private void StopServer()
        {
            if (serverProcess != null && !serverProcess.HasExited)
            {
                try
                {
                    AppendLog("⏳ 正在停止服务...");
                    try { serverProcess.Kill(); } catch { }
                    serverProcess.WaitForExit(3000);
                }
                catch (Exception ex)
                {
                    AppendLog("⚠ 停止时出错: " + ex.Message);
                }
            }
        }

        private void OpenBrowser()
        {
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = "http://localhost:3000/",
                    UseShellExecute = true
                });
            }
            catch (Exception ex)
            {
                AppendLog("❌ 打开浏览器失败: " + ex.Message);
            }
        }

        private void SetStatus(string text, System.Drawing.Color color)
        {
            if (InvokeRequired)
            {
                BeginInvoke(new Action(() => SetStatus(text, color)));
                return;
            }
            statusLbl.Text = "  " + text;
            statusLbl.BackColor = System.Drawing.Color.FromArgb(
                Math.Min(255, color.R + 30),
                Math.Min(255, color.G + 30),
                Math.Min(255, color.B + 30));
        }

        private void AppendLog(string text)
        {
            if (InvokeRequired)
            {
                BeginInvoke(new Action(() => AppendLog(text)));
                return;
            }
            var ts = DateTime.Now.ToString("HH:mm:ss");
            logBox.AppendText("[" + ts + "] " + text + Environment.NewLine);
        }
    }
}
