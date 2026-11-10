import os
import sys
import json
import time
import shutil
import ctypes
import platform
import threading
import subprocess
import urllib.request
import urllib.error
from typing import Dict, Any, List, Optional

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")

# Hardware-aware tested model catalogue (Section 19.3)
COMPATIBILITY_CATALOG = [
    {
        "tag": "llama3.2:1b",
        "name": "Llama 3.2 1B (Ultra Fast)",
        "download_size_gb": 1.3,
        "disk_size_gb": 1.5,
        "min_ram_gb": 4,
        "recommended_ram_gb": 8,
        "strengths": "Ultra-fast response, minimal memory overhead, excellent for laptops and quick analysis.",
        "supported_format": "json",
        "license": "Llama 3.2 Community License",
    },
    {
        "tag": "llama3.2:3b",
        "name": "Llama 3.2 3B (Recommended Standard)",
        "download_size_gb": 2.0,
        "disk_size_gb": 2.2,
        "min_ram_gb": 8,
        "recommended_ram_gb": 16,
        "strengths": "Optimal balance of analytical reasoning, structured dashboard planning, and fast response.",
        "supported_format": "json",
        "license": "Llama 3.2 Community License",
        "is_default": True,
    },
    {
        "tag": "qwen2.5:1.5b",
        "name": "Qwen 2.5 1.5B (Compact Analytical)",
        "download_size_gb": 1.0,
        "disk_size_gb": 1.2,
        "min_ram_gb": 4,
        "recommended_ram_gb": 8,
        "strengths": "Very fast tabular data understanding, compact footprint, reliable structured JSON.",
        "supported_format": "json",
        "license": "Apache 2.0",
    },
    {
        "tag": "qwen2.5:3b",
        "name": "Qwen 2.5 3B (High Precision Tabular)",
        "download_size_gb": 1.9,
        "disk_size_gb": 2.1,
        "min_ram_gb": 8,
        "recommended_ram_gb": 16,
        "strengths": "Superior structured plan accuracy, deep tabular schema reasoning, excellent filter logic.",
        "supported_format": "json",
        "license": "Apache 2.0",
    },
    {
        "tag": "phi3:mini",
        "name": "Phi-3 Mini 3.8B",
        "download_size_gb": 2.2,
        "disk_size_gb": 2.5,
        "min_ram_gb": 8,
        "recommended_ram_gb": 16,
        "strengths": "High reasoning density from Microsoft, strong mathematical and logic capabilities.",
        "supported_format": "json",
        "license": "MIT",
    },
]


class OllamaManager:
    """
    Manages the local Ollama Windows service lifecycle, hardware diagnostics,
    model download progress tracking, and structured output verification.
    Complies with Section 19 of the Master AI Patch & Update Specification.
    """

    def __init__(self, base_url: str = OLLAMA_BASE_URL):
        self.base_url = base_url.rstrip("/")
        self._pull_jobs: Dict[str, Dict[str, Any]] = {}
        self._pull_lock = threading.Lock()

    # -------------------------------------------------------------------------
    # Hardware Profiling (Windows WMI / ctypes)
    # -------------------------------------------------------------------------

    def get_hardware_specs(self) -> Dict[str, Any]:
        """
        Inspects host RAM, CPU, GPU, and disk space safely without external packages.
        """
        total_ram_gb = 8.0
        avail_ram_gb = 4.0
        os_platform = platform.system()
        os_release = platform.release()

        # Windows RAM detection via ctypes GlobalMemoryStatusEx
        if os_platform == "Windows":
            try:
                from ctypes import wintypes

                class MEMORYSTATUSEX(ctypes.Structure):
                    _fields_ = [
                        ("dwLength", wintypes.DWORD),
                        ("dwMemoryLoad", wintypes.DWORD),
                        ("ullTotalPhys", ctypes.c_uint64),
                        ("ullAvailPhys", ctypes.c_uint64),
                        ("ullTotalPageFile", ctypes.c_uint64),
                        ("ullAvailPageFile", ctypes.c_uint64),
                        ("ullTotalVirtual", ctypes.c_uint64),
                        ("ullAvailVirtual", ctypes.c_uint64),
                        ("ullAvailExtendedVirtual", ctypes.c_uint64),
                    ]

                stat = MEMORYSTATUSEX()
                stat.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
                if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat)):
                    total_ram_gb = round(stat.ullTotalPhys / (1024**3), 2)
                    avail_ram_gb = round(stat.ullAvailPhys / (1024**3), 2)
            except Exception:
                pass
        else:
            try:
                total_ram_gb = round(os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES") / (1024**3), 2)
            except Exception:
                pass

        # Disk space inspection
        models_dir = os.path.expanduser("~")
        total_disk_gb = 100.0
        free_disk_gb = 50.0
        try:
            total, used, free = shutil.disk_usage(models_dir)
            total_disk_gb = round(total / (1024**3), 2)
            free_disk_gb = round(free / (1024**3), 2)
        except Exception:
            pass

        # CPU Cores
        cpu_cores = os.cpu_count() or 4

        # GPU inspection
        gpu_name = "Integrated / CPU Fallback"
        gpu_vram_gb = 0.0
        if os_platform == "Windows":
            try:
                cmd = [
                    "powershell",
                    "-NoProfile",
                    "-Command",
                    "Get-CimInstance Win32_VideoController | Select-Object -Property Name, AdapterRAM | ConvertTo-Json",
                ]
                res = subprocess.run(cmd, capture_output=True, text=True, timeout=4)
                if res.returncode == 0 and res.stdout.strip():
                    parsed = json.loads(res.stdout)
                    item = parsed[0] if isinstance(parsed, list) else parsed
                    gpu_name = item.get("Name", gpu_name)
                    adapter_ram = item.get("AdapterRAM", 0) or 0
                    if adapter_ram > 0:
                        gpu_vram_gb = round(adapter_ram / (1024**3), 2)
            except Exception:
                pass

        # Hardware-aware recommendation
        if total_ram_gb >= 16:
            recommended_model = "llama3.2:3b"
            tier = "High Performance"
        elif total_ram_gb >= 8:
            recommended_model = "llama3.2:3b"
            tier = "Standard Desktop"
        else:
            recommended_model = "llama3.2:1b"
            tier = "Compact / Low Memory"

        return {
            "os": f"{os_platform} {os_release}",
            "cpu_architecture": platform.machine(),
            "cpu_cores": cpu_cores,
            "total_ram_gb": total_ram_gb,
            "avail_ram_gb": avail_ram_gb,
            "gpu_name": gpu_name,
            "gpu_vram_gb": gpu_vram_gb,
            "free_disk_gb": free_disk_gb,
            "total_disk_gb": total_disk_gb,
            "recommended_model": recommended_model,
            "hardware_tier": tier,
        }

    # -------------------------------------------------------------------------
    # Service Lifecycle & Detection
    # -------------------------------------------------------------------------

    def is_service_running(self) -> bool:
        """Checks if Ollama service is reachable on localhost."""
        try:
            req = urllib.request.Request(f"{self.base_url}/api/tags", method="GET")
            with urllib.request.urlopen(req, timeout=2) as resp:
                return resp.status == 200
        except Exception:
            return False

    def find_ollama_binary(self) -> Optional[str]:
        """Locates the Ollama executable on Windows."""
        # 1. LocalAppData standard path
        local_app_data = os.getenv("LOCALAPPDATA", "")
        if local_app_data:
            candidate = os.path.join(local_app_data, "Programs", "Ollama", "ollama.exe")
            if os.path.isfile(candidate):
                return candidate

        # 2. Program Files
        prog_files = os.getenv("ProgramFiles", "C:\\Program Files")
        candidate = os.path.join(prog_files, "Ollama", "ollama.exe")
        if os.path.isfile(candidate):
            return candidate

        # 3. In PATH
        which = shutil.which("ollama")
        if which and os.path.isfile(which):
            return which

        return None

    def start_service(self) -> Dict[str, Any]:
        """
        Starts the Ollama background service if not already running.
        Spawns detached process with CREATE_NO_WINDOW so no console window appears.
        """
        if self.is_service_running():
            return {"status": "running", "already_running": True, "message": "Ollama service is active."}

        binary = self.find_ollama_binary()
        if not binary:
            return {
                "status": "not_installed",
                "message": "Ollama binary was not found in standard Windows directories (%LOCALAPPDATA%\\Programs\\Ollama).",
                "install_url": "https://ollama.com/download/windows",
            }

        try:
            creationflags = 0
            if sys.platform == "win32":
                creationflags = subprocess.CREATE_NO_WINDOW | subprocess.DETACHED_PROCESS

            subprocess.Popen(
                [binary, "serve"],
                creationflags=creationflags,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )

            # Wait up to 8 seconds for the port to start responding
            for _ in range(16):
                time.sleep(0.5)
                if self.is_service_running():
                    return {
                        "status": "started",
                        "already_running": False,
                        "message": "Ollama local service started successfully.",
                    }

            return {
                "status": "starting",
                "message": "Ollama process launched; still warming up.",
            }
        except Exception as e:
            return {"status": "error", "message": f"Failed to launch Ollama service: {str(e)}"}

    # -------------------------------------------------------------------------
    # Model Catalog & Local Tag Inspection
    # -------------------------------------------------------------------------

    def get_catalog(self) -> List[Dict[str, Any]]:
        """Returns the hardware-aware tested model catalogue."""
        installed = {m["name"].split(":")[0]: m for m in self.list_installed_models()}
        installed_full = {m["name"]: m for m in self.list_installed_models()}

        catalog = []
        for item in COMPATIBILITY_CATALOG:
            tag = item["tag"]
            is_installed = tag in installed_full or tag.split(":")[0] in installed
            cat_item = dict(item)
            cat_item["is_installed"] = is_installed
            catalog.append(cat_item)
        return catalog

    def list_installed_models(self) -> List[Dict[str, Any]]:
        """Lists all models currently available in local Ollama storage."""
        if not self.is_service_running():
            return []
        try:
            req = urllib.request.Request(f"{self.base_url}/api/tags", method="GET")
            with urllib.request.urlopen(req, timeout=3) as resp:
                data = json.loads(resp.read().decode())
                return data.get("models", [])
        except Exception:
            return []

    # -------------------------------------------------------------------------
    # Streaming Model Pull with Progress
    # -------------------------------------------------------------------------

    def start_model_pull(self, model_tag: str) -> Dict[str, Any]:
        """
        Initiates a background download of the specified model.
        Reports live progress with percentage, speed, and status.
        """
        # Validate model tag against catalog to prevent arbitrary downloads
        valid_tags = [c["tag"] for c in COMPATIBILITY_CATALOG]
        if model_tag not in valid_tags and not any(model_tag.startswith(t.split(":")[0]) for t in valid_tags):
            return {"status": "error", "message": f"Model '{model_tag}' is not in the approved compatibility catalog."}

        # Check free disk space before pulling
        specs = self.get_hardware_specs()
        cat_meta = next((c for c in COMPATIBILITY_CATALOG if c["tag"] == model_tag), None)
        required_disk = cat_meta["disk_size_gb"] if cat_meta else 2.5
        if specs["free_disk_gb"] < (required_disk + 1.0):
            return {
                "status": "error",
                "message": f"Insufficient disk space. Model requires ~{required_disk} GB, but only {specs['free_disk_gb']} GB is available.",
            }

        with self._pull_lock:
            if model_tag in self._pull_jobs and self._pull_jobs[model_tag].get("status") in ["downloading", "starting"]:
                return {"status": "already_running", "job": self._pull_jobs[model_tag]}

            job = {
                "model": model_tag,
                "status": "starting",
                "completed_bytes": 0,
                "total_bytes": int(required_disk * (1024**3)),
                "percent": 0.0,
                "speed_mbps": 0.0,
                "status_text": "Connecting to Ollama model registry...",
                "error": None,
                "started_at": time.time(),
            }
            self._pull_jobs[model_tag] = job

        thread = threading.Thread(target=self._pull_worker, args=(model_tag,), daemon=True)
        thread.start()

        return {"status": "started", "job": job}

    def _pull_worker(self, model_tag: str):
        """Streaming worker reading Ollama /api/pull JSON lines."""
        url = f"{self.base_url}/api/pull"
        payload = json.dumps({"name": model_tag, "stream": True}).encode("utf-8")
        req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"}, method="POST")

        last_time = time.time()
        last_bytes = 0

        try:
            with urllib.request.urlopen(req, timeout=300) as resp:
                for line in resp:
                    if not line:
                        continue
                    try:
                        chunk = json.loads(line.decode("utf-8"))
                        status_str = chunk.get("status", "")
                        completed = chunk.get("completed", 0)
                        total = chunk.get("total", 0)

                        now = time.time()
                        dt = now - last_time
                        speed = 0.0
                        if dt >= 1.0 and completed > last_bytes:
                            speed = round((completed - last_bytes) / (1024 * 1024 * dt), 2)
                            last_time = now
                            last_bytes = completed

                        pct = 0.0
                        if total > 0:
                            pct = round((completed / total) * 100, 1)

                        with self._pull_lock:
                            if status_str == "success":
                                self._pull_jobs[model_tag]["status"] = "completed"
                                self._pull_jobs[model_tag]["percent"] = 100.0
                                self._pull_jobs[model_tag]["status_text"] = "Model ready for local inference."
                                return
                            else:
                                self._pull_jobs[model_tag]["status"] = "downloading"
                                self._pull_jobs[model_tag]["status_text"] = status_str
                                if total > 0:
                                    self._pull_jobs[model_tag]["total_bytes"] = total
                                    self._pull_jobs[model_tag]["completed_bytes"] = completed
                                    self._pull_jobs[model_tag]["percent"] = pct
                                if speed > 0:
                                    self._pull_jobs[model_tag]["speed_mbps"] = speed
                    except json.JSONDecodeError:
                        pass

            with self._pull_lock:
                self._pull_jobs[model_tag]["status"] = "completed"
                self._pull_jobs[model_tag]["percent"] = 100.0
                self._pull_jobs[model_tag]["status_text"] = "Model ready."
        except Exception as e:
            with self._pull_lock:
                self._pull_jobs[model_tag]["status"] = "error"
                self._pull_jobs[model_tag]["error"] = str(e)
                self._pull_jobs[model_tag]["status_text"] = f"Download failed: {str(e)}"

    def get_pull_status(self, model_tag: str) -> Dict[str, Any]:
        """Returns the current download progress for a model."""
        with self._pull_lock:
            if model_tag in self._pull_jobs:
                return self._pull_jobs[model_tag]

        # Check if already installed
        installed = self.list_installed_models()
        for m in installed:
            if m.get("name") == model_tag or m.get("name", "").startswith(model_tag.split(":")[0]):
                return {
                    "model": model_tag,
                    "status": "completed",
                    "percent": 100.0,
                    "status_text": "Model already installed.",
                }

        return {"model": model_tag, "status": "idle", "percent": 0.0, "status_text": "Not installed."}

    # -------------------------------------------------------------------------
    # Health Check & Structured Output Verification Test
    # -------------------------------------------------------------------------

    def run_health_test(self, model_tag: Optional[str] = None) -> Dict[str, Any]:
        """
        Executes a lightweight structured JSON inference test against the local model
        to guarantee that JSON mode and local analytical planning are operational.
        """
        if not self.is_service_running():
            return {
                "ready": False,
                "error": "Ollama local service is not responding on 127.0.0.1:11434.",
            }

        installed = self.list_installed_models()
        if not installed:
            return {
                "ready": False,
                "error": "No AI models installed in local Ollama storage. Please download a model from the catalog.",
            }

        target_model = model_tag or installed[0]["name"]
        test_prompt = "Return a JSON object with: status='ok', engine='duckdb_analytical', ready=true."

        start_t = time.time()
        url = f"{self.base_url}/api/generate"
        payload = json.dumps(
            {
                "model": target_model,
                "prompt": test_prompt,
                "format": "json",
                "stream": False,
                "options": {"temperature": 0.0},
            }
        ).encode("utf-8")

        req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"}, method="POST")

        try:
            with urllib.request.urlopen(req, timeout=25) as resp:
                data = json.loads(resp.read().decode())
                raw_response = data.get("response", "{}")
                parsed_json = json.loads(raw_response)
                latency_ms = round((time.time() - start_t) * 1000, 1)

                return {
                    "ready": True,
                    "model": target_model,
                    "latency_ms": latency_ms,
                    "structured_json_valid": isinstance(parsed_json, dict),
                    "output": parsed_json,
                    "status_message": f"Local AI model '{target_model}' verified and ready (Latency: {latency_ms}ms).",
                }
        except Exception as e:
            return {
                "ready": False,
                "model": target_model,
                "error": f"Verification failed: {str(e)}",
            }


# Global singleton instance
ollama_manager = OllamaManager()
