import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { exec, execFile } from "child_process";
import fs from "fs";

dotenv.config();

const app = express();
app.use(express.json());

let simulationMode = 'none';

function applySimulationToPods(pods: any[]) {
  if (simulationMode === 'backlog') {
    const hasCoreLedger = pods.some(p => p.name.includes("core-ledger"));
    if (!hasCoreLedger) {
      pods.unshift({ name: "core-ledger-pod-68a8", namespace: "coral-prod", status: "CrashLoopBackOff", cpu: "1500m", memory: "1.2Gi", restarts: 12 });
    }
    for (const p of pods) {
      if (p.name.includes("core-ledger")) {
        p.status = "CrashLoopBackOff";
        p.cpu = `${1500 + Math.floor(Math.random() * 300)}m`;
        p.restarts = Math.max(p.restarts || 0, 12);
      } else {
        let currentCpu = parseInt((p.cpu || "0").toString().replace("m", "")) || 0;
        p.cpu = `${currentCpu + 50 + Math.floor(Math.random() * 50)}m`;
      }
    }
  } else if (simulationMode === 'crypto') {
    const hasMiner = pods.some(p => p.name.includes("unknown-miner"));
    if (!hasMiner) {
      pods.unshift({ name: "unknown-miner-pod-x9", namespace: "default", status: "Running", cpu: "1999m", memory: "4.0Gi", restarts: 0 });
    }
    for (const p of pods) {
      if (p.name.includes("unknown-miner")) {
        p.status = "Running";
        p.cpu = `${1999 + Math.floor(Math.random() * 100)}m`;
        p.memory = "4.0Gi";
      }
    }
  } else if (simulationMode === 'pending') {
    const hasPending = pods.some(p => p.name.includes("ai-inference"));
    if (!hasPending) {
      pods.unshift({ name: "ai-inference-worker-stuck", namespace: "gpu-pool", status: "Pending", cpu: "0m", memory: "0Mi", restarts: 0 });
    }
    for (const p of pods) {
      if (p.name.includes("ai-inference")) {
        p.status = "Pending";
        p.cpu = "0m";
        p.memory = "0Mi";
      }
    }
  } else if (simulationMode === 'imagepull') {
    const hasImage = pods.some(p => p.name.includes("payment-gateway"));
    if (!hasImage) {
      pods.unshift({ name: "payment-gateway-v2-d981", namespace: "coral-prod", status: "ImagePullBackOff", cpu: "10m", memory: "50Mi", restarts: 3 });
    }
    for (const p of pods) {
      if (p.name.includes("payment-gateway")) {
        p.status = "ImagePullBackOff";
        p.cpu = "10m";
        p.memory = "50Mi";
        p.restarts = Math.max(p.restarts || 0, 3);
      }
    }
  } else if (simulationMode === 'zombie') {
    const hasZombie = pods.some(p => p.name.includes("legacy-reporting"));
    if (!hasZombie) {
      pods.unshift({ name: "legacy-reporting-job-h9a1", namespace: "default", status: "Running", cpu: "2m", memory: "10Mi", restarts: 0 });
    }
    for (const p of pods) {
      if (p.name.includes("legacy-reporting")) {
        p.status = "Running";
        p.cpu = "2m";
        p.memory = "10Mi";
      }
    }
  }
  return pods;
}

// Kubernetes Live Integration Endpoints
app.get("/api/v1/k8s/pods", (req, res) => {
  exec("kubectl get pods -A -o json", async (error, stdout, stderr) => {
    if (error || stderr) {
      console.warn("kubectl get pods failed or stderr output. Falling back to Coral-telemetry database metrics.");
      
      try {
        // Query the latest 150 metrics from Coral to find the latest states for unique pods
        const rows = await queryCoral("SELECT pod_name, namespace, cpu_usage, memory_usage, restart_count, status, replicas FROM supabase.pod_metrics ORDER BY id DESC LIMIT 150;");
        
        if (rows && rows.length > 0) {
          const uniquePods = new Map();
          for (const row of rows) {
            if (!uniquePods.has(row.pod_name)) {
              uniquePods.set(row.pod_name, {
                name: row.pod_name,
                namespace: row.namespace,
                status: row.status,
                cpu: `${row.cpu_usage}m`,
                memory: `${row.memory_usage}Mi`,
                restarts: row.restart_count,
                replicas: row.replicas
              });
            }
          }
          const podsList = Array.from(uniquePods.values());
          return res.json({ success: true, pods: applySimulationToPods(podsList), source: "coral-telemetry", simulationMode });
        }
      } catch (dbErr) {
        console.error("Failed to query Coral for fallback metrics:", dbErr);
      }

      // Final fallback if Coral database is empty or fails
      const fallbackPods = [
        { name: "core-ledger-pod-68a8", namespace: "coral-prod", status: (simulationMode !== 'none') ? "CrashLoopBackOff" : "Running", cpu: "450m", memory: "1.2Gi", restarts: (simulationMode !== 'none') ? 12 : 3 },
        { name: "auth-gateway-pod-f2b3", namespace: "coral-prod", status: "Running", cpu: "120m", memory: "256Mi", restarts: 0 },
        { name: "ingress-nginx-controller", namespace: "kube-system", status: "Running", cpu: "110m", memory: "190Mi", restarts: 1 }
      ];
      return res.json({ success: true, pods: applySimulationToPods(fallbackPods), source: "mock-fallback", simulationMode });
    }

    try {
      const parsed = JSON.parse(stdout);
      const items = parsed.items || [];
      const pods = items.map((item: any) => {
        const name = item.metadata?.name || "unknown";
        const namespace = item.metadata?.namespace || "default";
        
        let status = "Unknown";
        if (item.status) {
          if (item.status.containerStatuses && item.status.containerStatuses.length > 0) {
            const state = item.status.containerStatuses[0].state;
            if (state.waiting) {
              status = state.waiting.reason || "Waiting";
            } else if (state.terminated) {
              status = state.terminated.reason || "Terminated";
            } else if (state.running) {
              status = "Running";
            }
          } else {
            status = item.status.phase || "Unknown";
          }
        }

        let restarts = 0;
        if (item.status?.containerStatuses && item.status.containerStatuses.length > 0) {
          restarts = item.status.containerStatuses.reduce((acc: number, c: any) => acc + (c.restartCount || 0), 0);
        }

        let cpu = "120m";
        let memory = "256Mi";
        const containers = item.spec?.containers || [];
        if (containers.length > 0 && containers[0].resources?.requests) {
          cpu = containers[0].resources.requests.cpu || cpu;
          memory = containers[0].resources.requests.memory || memory;
        }

        return { name, namespace, status, cpu, memory, restarts };
      });

      // Fetch live metrics using kubectl top pods
      exec("kubectl top pods -A --no-headers", (topErr, topStdout) => {
        if (!topErr && topStdout) {
          const topLines = topStdout.trim().split("\n");
          const topMap = new Map();
          for (const line of topLines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 4) {
              topMap.set(`${parts[0]}/${parts[1]}`, { cpu: parts[2], mem: parts[3] });
            }
          }
          for (const p of pods) {
            const liveData = topMap.get(`${p.namespace}/${p.name}`);
            if (liveData) {
              p.cpu = liveData.cpu;
              p.memory = liveData.mem;
            }
          }
        }
          
        const modifiedPods = applySimulationToPods(pods);
        return res.json({ success: true, pods: modifiedPods, source: "kubectl", simulationMode });
      });

    } catch (parseErr) {
      console.error("Failed to parse kubectl stdout json, fallback applied:", parseErr);
      return res.json({ success: true, pods: [], source: "error-fallback", simulationMode });
    }
  });
});

app.get("/api/v1/k8s/logs", (req, res) => {
  const { pod_name, namespace } = req.query;
  if (!pod_name || !namespace) {
    return res.status(400).json({ error: "Missing pod_name or namespace query parameter" });
  }

  const cmd = `kubectl logs ${pod_name} -n ${namespace} --tail=150`;
  exec(cmd, (error, stdout, stderr) => {
    if (error) {
      console.warn("kubectl logs signature check failed. Yielding simulated live container logs. Status:", error);
      
      const date = new Date();
      const timeStr = date.toISOString().slice(11, 23) + 'Z';
      
      let logsList = [
        `[${timeStr}] INFO Initializing micro-service bootstrap container trace for ${pod_name}...`,
        `[${timeStr}] INFO Checking environment namespaces & config map links...`,
      ];

      if (String(pod_name).includes("miner") || String(pod_name).includes("security-anomaly")) {
        logsList.push(
          `[${timeStr}] WARNING Suspicious compute activity flagged by kernel security module.`,
          `[${timeStr}] INFO Executing mining daemon: ./xmrig --donate-level 1 -o pool.supportxmr.com:3333 -u 45t...`,
          `[${timeStr}] INFO Core worker allocation: Thread-0 active (99.8% CPU), Thread-1 active (99.9% CPU).`,
          `[${timeStr}] WARN Thermal throttle threshold engaged: CPU Core Temperature reached 94C.`,
          `[${timeStr}] ALERT Security Agent: Unsanctioned mining binary detected in default namespace.`
        );
      } else if (String(pod_name).includes("ai-inference") && (simulationMode === 'pending')) {
        logsList.push(
          `[${timeStr}] WARNING Pod cannot be scheduled in 'gpu-pool' namespace: Insufficient resources.`,
          `[${timeStr}] ERR scheduling failed: 0/4 nodes available: 4 Insufficient nvidia.com/gpu.`,
          `[${timeStr}] INFO Cluster Autoscaler triggered. Awaiting scale up of dynamic g2-standard-4 node pool...`
        );
      } else if (String(pod_name).includes("payment-gateway") && (simulationMode === 'imagepull')) {
        logsList.push(
          `[${timeStr}] INFO Pulling docker image "payment-gateway:v3.1.0-alpha"...`,
          `[${timeStr}] WARNING Failed to pull image: rpc error: code = Unknown desc = Error response from daemon: unauthorized: GCR credential token refresh failed.`,
          `[${timeStr}] ERR Back-off pulling image "payment-gateway:v3.1.0-alpha".`,
          `[${timeStr}] CRIT Container runtime state: ImagePullBackOff (Failed to authenticate GCR credentials)`
        );
      } else if (String(pod_name).includes("core-ledger") && (simulationMode !== 'none')) {
        logsList.push(
          `[${timeStr}] WARN Heap allocation bounds critical: 512Mi nearing limits!`,
          `[${timeStr}] WARN Latency alert: 480ms query response delay recorded in thread pool.`,
          `[${timeStr}] CRIT Exception in thread "main" java.lang.OutOfMemoryError: Java heap space`,
          `[${timeStr}] CRIT Container ${pod_name} terminated with exit code 137 (OOMKilled).`,
          `[${timeStr}] CRIT Kubelet alert: Pod evicted on worker node-1 due to namespace memory starvation.`,
          `[${timeStr}] WARN Pod container restarting in CrashLoopBackOff state.`
        );
      } else {
        logsList.push(
          `[${timeStr}] INFO Database handshake validated cleanly on regional clusters.`,
          `[${timeStr}] INFO Heartbeat signal: OK (Uptime: 1.4h)`,
          `[${timeStr}] INFO Running garbage collection sweep success. Released 45MB.`,
          `[${timeStr}] INFO Listening for message payloads on port 8080...`
        );
      }

      return res.json({ success: true, logs: logsList.join("\n"), source: "mock-fallback" });
    }

    return res.json({ success: true, logs: (stdout + "\n" + stderr).trim(), source: "kubectl" });
  });
});
const PORT = parseInt(process.env.PORT || "3000", 10);

// Lazy initialization of Gemini client as per rules
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    aiClient = new GoogleGenAI({
      apiKey: apiKey || "MOCK_KEY",
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// API Routes
simulationMode = 'none';

const BASE_PODS = [
  { name: "auth-gateway-pod-f2b3", namespace: "coral-prod", app: "auth-gateway", cpuBase: 80, memBase: 256, replicas: 3 },
  { name: "frontend-ui-pod-a119", namespace: "coral-prod", app: "frontend-ui", cpuBase: 40, memBase: 128, replicas: 3 },
  { name: "core-ledger-pod-68a8", namespace: "coral-prod", app: "core-ledger", cpuBase: 450, memBase: 1200, replicas: 10 },
  { name: "payment-gateway-v2-d981", namespace: "coral-prod", app: "payment-gateway", cpuBase: 120, memBase: 384, replicas: 2 },
  { name: "notification-worker-pod-eff1", namespace: "coral-prod", app: "notification-worker", cpuBase: 50, memBase: 192, replicas: 2 },
  { name: "database-proxy-pod-c412", namespace: "coral-prod", app: "database-proxy", cpuBase: 120, memBase: 512, replicas: 2 },
  { name: "cache-coordinator-pod-b771", namespace: "coral-prod", app: "cache-coordinator", cpuBase: 200, memBase: 1024, replicas: 1 },
  { name: "audit-logger-pod-9e12", namespace: "coral-prod", app: "audit-logger", cpuBase: 30, memBase: 128, replicas: 2 },

  { name: "ai-inference-worker-stuck", namespace: "gpu-pool", app: "ai-inference", cpuBase: 450, memBase: 2048, replicas: 1 },
  { name: "model-preprocessor-pod-88a2", namespace: "gpu-pool", app: "model-preprocessor", cpuBase: 100, memBase: 256, replicas: 2 },

  { name: "ingress-nginx-controller-abc1", namespace: "kube-system", app: "ingress-nginx", cpuBase: 110, memBase: 190, replicas: 2 },
  { name: "kube-dns-68bdc49d8", namespace: "kube-system", app: "kube-dns", cpuBase: 20, memBase: 70, replicas: 2 },
  { name: "kube-proxy-8x921", namespace: "kube-system", app: "kube-proxy", cpuBase: 15, memBase: 50, replicas: 3 },
  { name: "prometheus-server-cf42", namespace: "kube-system", app: "prometheus", cpuBase: 450, memBase: 2048, replicas: 1 },
  { name: "aws-node-daemonset-y78a", namespace: "kube-system", app: "aws-node", cpuBase: 10, memBase: 45, replicas: 4 },

  { name: "legacy-reporting-job-h9a1", namespace: "default", app: "legacy-reporting", cpuBase: 25, memBase: 64, replicas: 1 },
  { name: "temp-utility-container", namespace: "default", app: "utility", cpuBase: 5, memBase: 32, replicas: 1 },
  { name: "developer-sandbox-pod", namespace: "default", app: "sandbox", cpuBase: 15, memBase: 64, replicas: 1 },
  { name: "internal-dashboard-pod", namespace: "default", app: "internal-dashboard", cpuBase: 25, memBase: 90, replicas: 1 },
  { name: "unknown-miner-pod-x9", namespace: "default", app: "unknown-miner", cpuBase: 1999, memBase: 4096, replicas: 1 }
];

function resetAndPreseedTelemetry() {
  console.log("[TELEMETRY SETUP] Resetting and pre-seeding JSONL databases...");
  const dataDir = path.join(process.cwd(), "../backend/coral/data");
  const filesToReset = [
    { dir: "pod_metrics", file: "pod_metrics.jsonl" },
    { dir: "billing_events", file: "billing_events.jsonl" },
    { dir: "deployments", file: "deployments.jsonl" },
    { dir: "incidents", file: "incidents.jsonl" },
    { dir: "worker_events", file: "worker_events.jsonl" },
    { dir: "firewall_events", file: "firewall_events.jsonl" }
  ];

  for (const f of filesToReset) {
    const dirPath = path.join(dataDir, f.dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    fs.writeFileSync(path.join(dirPath, f.file), "");
  }

  const podMetricsPath = path.join(dataDir, "pod_metrics/pod_metrics.jsonl");
  let podLines = "";
  const now = Date.now();

  for (let i = 4; i >= 0; i--) {
    const timestamp = new Date(now - i * 3 * 60 * 1000).toISOString();
    for (const pod of BASE_PODS) {
      if (pod.name === "unknown-miner-pod-x9") continue;
      if (pod.name === "ai-inference-worker-stuck" && i > 0) continue;

      let status = "Running";
      let cpu = pod.cpuBase + Math.floor(Math.random() * 20) - 10;
      let mem = pod.memBase + Math.floor(Math.random() * 40) - 20;
      let restarts = 0;

      if (pod.name === "core-ledger-pod-68a8") {
        status = "Running";
        cpu = 300 + Math.floor(Math.random() * 50);
        mem = 800 + Math.floor(Math.random() * 50);
      }

      const row = {
        id: now - i * 3 * 60 * 1000 + Math.floor(Math.random() * 1000),
        service_name: pod.app,
        namespace: pod.namespace,
        pod_name: pod.name,
        replicas: pod.replicas,
        cpu_usage: Math.max(0, cpu),
        memory_usage: Math.max(0, mem),
        restart_count: restarts,
        status: status,
        timestamp: timestamp
      };
      podLines += JSON.stringify(row) + "\n";
    }
  }
  fs.writeFileSync(podMetricsPath, podLines);

  const deploymentsPath = path.join(dataDir, "deployments/deployments.jsonl");
  const initialDeploys = [
    { id: 1, deployment_id: "deploy-auth-101", service_name: "auth-gateway", version: "v1.2.0", deployed_by: "ci-cd-bot", deployed_at: new Date(now - 60 * 60 * 1000).toISOString() },
    { id: 2, deployment_id: "deploy-ledger-200", service_name: "core-ledger", version: "v2.5.0", deployed_by: "dev-team", deployed_at: new Date(now - 120 * 60 * 1000).toISOString() },
    { id: 3, deployment_id: "deploy-frontend-50", service_name: "frontend-ui", version: "v1.10.2", deployed_by: "ci-cd-bot", deployed_at: new Date(now - 30 * 60 * 1000).toISOString() }
  ];
  fs.writeFileSync(deploymentsPath, initialDeploys.map(d => JSON.stringify(d)).join("\n") + "\n");

  const billingPath = path.join(dataDir, "billing_events/billing_events.jsonl");
  const initialBilling = [
    { id: 1, service_name: "auth-gateway", estimated_cost: 120.50, anomaly_score: 0.05, severity: "low", timestamp: new Date(now - 15 * 60 * 1000).toISOString() },
    { id: 2, service_name: "core-ledger", estimated_cost: 850.00, anomaly_score: 0.12, severity: "low", timestamp: new Date(now - 15 * 60 * 1000).toISOString() },
    { id: 3, service_name: "frontend-ui", estimated_cost: 95.00, anomaly_score: 0.02, severity: "low", timestamp: new Date(now - 15 * 60 * 1000).toISOString() }
  ];
  fs.writeFileSync(billingPath, initialBilling.map(b => JSON.stringify(b)).join("\n") + "\n");

  const workerPath = path.join(dataDir, "worker_events/worker_events.jsonl");
  const initialWorkers = [
    { id: 1, worker_name: "auth-gateway", retry_count: 0, failed_jobs: 0, queue_depth: 5, status: "healthy", timestamp: new Date(now - 5 * 60 * 1000).toISOString() },
    { id: 2, worker_name: "core-ledger", retry_count: 2, failed_jobs: 0, queue_depth: 25, status: "healthy", timestamp: new Date(now - 5 * 60 * 1000).toISOString() }
  ];
  fs.writeFileSync(workerPath, initialWorkers.map(w => JSON.stringify(w)).join("\n") + "\n");

  const incidentsPath = path.join(dataDir, "incidents/incidents.jsonl");
  const initialIncidents = [
    { id: 1, service_name: "auth-gateway", severity: "medium", incident_type: "API Latency Warning", message: "Resolved: Auth service response time exceeded 200ms threshold.", resolved: true, created_at: new Date(now - 45 * 60 * 1000).toISOString() }
  ];
  fs.writeFileSync(incidentsPath, initialIncidents.map(i => JSON.stringify(i)).join("\n") + "\n");

  const firewallPath = path.join(dataDir, "firewall_events/firewall_events.jsonl");
  const initialFirewalls = [
    { id: 1, timestamp: new Date(now - 10 * 1000).toISOString().slice(11, 19) + 'Z', source_ip: "192.168.1.15", target_node: "us-east-1a", protocol: "TCP/443", action: "ALLOW", event_desc: "Valid telemetry sync" }
  ];
  fs.writeFileSync(firewallPath, initialFirewalls.map(fw => JSON.stringify(fw)).join("\n") + "\n");

  console.log("[TELEMETRY SETUP] Seeding completed successfully!");
}

function triggerSimulationEvents(mode: string) {
  console.log(`[SIMULATOR] Triggering simulation events for mode: ${mode}`);
  const dataDir = path.join(process.cwd(), "../backend/coral/data");
  const timestamp = new Date().toISOString();
  const id = Date.now();

  if (mode === 'none') {
    resetAndPreseedTelemetry();
    return;
  }

  if (mode === 'backlog') {
    const deploy = { id, deployment_id: `deploy-ledger-${Math.floor(Math.random()*1000)}`, service_name: "core-ledger", version: "v2.5.1-leak", deployed_by: "ci-cd-bot", deployed_at: timestamp };
    fs.appendFileSync(path.join(dataDir, "deployments/deployments.jsonl"), JSON.stringify(deploy) + "\n");

    const bill = { id: id + 1, service_name: "core-ledger", estimated_cost: 4120.50, anomaly_score: 0.98, severity: "critical", timestamp };
    fs.appendFileSync(path.join(dataDir, "billing_events/billing_events.jsonl"), JSON.stringify(bill) + "\n");

    const incident = { id: id + 2, service_name: "core-ledger", severity: "critical", incident_type: "Memory Leak CrashLoopBackOff", message: "Service core-ledger is leaking memory in JVM heap. Pod restarts rising.", resolved: false, created_at: timestamp };
    fs.appendFileSync(path.join(dataDir, "incidents/incidents.jsonl"), JSON.stringify(incident) + "\n");

    const worker = { id: id + 3, worker_name: "core-ledger", retry_count: 142, failed_jobs: 84, queue_depth: 1850, status: "stuck", timestamp };
    fs.appendFileSync(path.join(dataDir, "worker_events/worker_events.jsonl"), JSON.stringify(worker) + "\n");

  } else if (mode === 'crypto') {
    const deploy = { id: id - 5000, deployment_id: "deploy-unauth-009", service_name: "unknown-miner", version: "v0.0.0-malicious", deployed_by: "external-ip-hack", deployed_at: timestamp };
    fs.appendFileSync(path.join(dataDir, "deployments/deployments.jsonl"), JSON.stringify(deploy) + "\n");

    const bill = { id, service_name: "unknown-miner", estimated_cost: 3150.00, anomaly_score: 0.92, severity: "high", timestamp };
    fs.appendFileSync(path.join(dataDir, "billing_events/billing_events.jsonl"), JSON.stringify(bill) + "\n");

    const incident = { id: id + 1, service_name: "unknown-miner", severity: "critical", incident_type: "Crypto Mining Intrusion", message: "Unsanctioned binary running in default namespace consuming 99% CPU.", resolved: false, created_at: timestamp };
    fs.appendFileSync(path.join(dataDir, "incidents/incidents.jsonl"), JSON.stringify(incident) + "\n");

  } else if (mode === 'pending') {
    const incident = { id, service_name: "ai-inference", severity: "high", incident_type: "GPU Resources Exhausted", message: "Inference worker is pending due to lack of available GKE nodes with dynamic GPU attachments.", resolved: false, created_at: timestamp };
    fs.appendFileSync(path.join(dataDir, "incidents/incidents.jsonl"), JSON.stringify(incident) + "\n");

  } else if (mode === 'imagepull') {
    const deploy = { id, deployment_id: `deploy-pay-${Math.floor(Math.random()*1000)}`, service_name: "payment-gateway", version: "v3.1.0-alpha", deployed_by: "developer-sandbox", deployed_at: timestamp };
    fs.appendFileSync(path.join(dataDir, "deployments/deployments.jsonl"), JSON.stringify(deploy) + "\n");

    const incident = { id: id + 1, service_name: "payment-gateway", severity: "high", incident_type: "ImagePullBackOff", message: "Failed to pull image payment-gateway:v3.1.0-alpha. Manifest or credentials invalid.", resolved: false, created_at: timestamp };
    fs.appendFileSync(path.join(dataDir, "incidents/incidents.jsonl"), JSON.stringify(incident) + "\n");

  } else if (mode === 'zombie') {
    const deploy = { id: id - 5000, deployment_id: "deploy-zombie-007", service_name: "legacy-reporting", version: "v1.0.0-orphaned", deployed_by: "legacy-worker-cron", deployed_at: timestamp };
    fs.appendFileSync(path.join(dataDir, "deployments/deployments.jsonl"), JSON.stringify(deploy) + "\n");

    const bill = { id, service_name: "legacy-reporting", estimated_cost: 890.00, anomaly_score: 0.85, severity: "medium", timestamp };
    fs.appendFileSync(path.join(dataDir, "billing_events/billing_events.jsonl"), JSON.stringify(bill) + "\n");

    const incident = { id: id + 1, service_name: "legacy-reporting", severity: "medium", incident_type: "FinOps Orphaned Resource", message: "Legacy reporting jobs are running continuously without active query connections, wasting resources.", resolved: false, created_at: timestamp };
    fs.appendFileSync(path.join(dataDir, "incidents/incidents.jsonl"), JSON.stringify(incident) + "\n");
  }
}

app.post("/api/simulate", (req, res) => {
  simulationMode = req.body.mode || 'backlog';
  triggerSimulationEvents(simulationMode);
  res.json({
    success: true,
    message: `Kubernetes simulation armed: ${simulationMode}.`
  });
});
app.get("/api/simulation-state", (req, res) => {
  res.json({ mode: simulationMode });
});

const queryCoral = (sql: string): Promise<any[]> => {
  return new Promise((resolve) => {
    const coralBin = process.platform === "win32" ? "coral.exe" : "coral";
    const coralPath = path.join(process.cwd(), "../backend/coral", coralBin);
    const coralCwd = path.join(process.cwd(), "../backend/coral");
    const cleanSql = sql.replace(/--.*$/gm, '').trim();

    execFile(coralPath, ["sql", "--format", "json", "--", cleanSql], { cwd: coralCwd }, (error, stdout, stderr) => {
      if (error) {
        console.error(`Coral internal investigator query error: ${stderr || error.message}`);
        resolve([]);
      } else {
        try {
          resolve(JSON.parse(stdout));
        } catch (e) {
          resolve([]);
        }
      }
    });
  });
};

function generateFallbackSreReport(
  pods: any[],
  deploys: any[],
  bills: any[],
  incidents: any[],
  workers: any[]
) {
  const crashedPod = pods.find(p => p.status === 'CrashLoopBackOff' || p.status === 'OOMKilled' || p.status === 'Pending' || p.status === 'ImagePullBackOff');
  const highCpuPod = pods.find(p => p.cpu_usage > 1000);
  const billingAnomaly = bills.find(b => b.anomaly_score > 0.5);
  const activeIncident = incidents.find(i => !i.resolved);
  const workerBacklog = workers.find(w => w.queue_depth > 100 || w.retry_count > 5);

  let sql = "";
  let explanation = "";
  let insights: string[] = [];

  if (crashedPod) {
    explanation = `Critical SRE Incident: The pod '${crashedPod.pod_name}' in namespace '${crashedPod.namespace}' is currently in '${crashedPod.status}' state with ${crashedPod.restart_count} restarts. Live Flint query confirms container resources limits were breached.`;
    insights = [
      `Pod '${crashedPod.pod_name}' restarts reached critical count (${crashedPod.restart_count}).`,
      `Current telemetry shows CPU usage of ${crashedPod.cpu_usage}m and Memory usage of ${crashedPod.memory_usage}Mi.`,
      `Recommend: Increase memory limits in Helm config and set up alerts for status = '${crashedPod.status}'.`
    ];
    sql = `SELECT pod_name, namespace, cpu_usage, memory_usage, restart_count, status FROM supabase.pod_metrics WHERE status = '${crashedPod.status}' ORDER BY timestamp DESC;`;
  } else if (highCpuPod) {
    explanation = `Resource Anomaly: High CPU usage (${highCpuPod.cpu_usage}m) detected on pod '${highCpuPod.pod_name}' in namespace '${highCpuPod.namespace}'. This is causing node CPU throttling.`;
    insights = [
      `CPU utilization spiked to ${highCpuPod.cpu_usage}m.`,
      `The replicas for this service are currently scaled to ${highCpuPod.replicas || 1}.`,
      `Recommend: Execute HPA auto-scaling trigger or check for infinite loop tasks.`
    ];
    sql = `SELECT pod_name, cpu_usage, memory_usage, replicas, status FROM supabase.pod_metrics ORDER BY cpu_usage DESC LIMIT 5;`;
  } else if (billingAnomaly) {
    explanation = `FinOps Alert: A cost anomaly detected for service '${billingAnomaly.service_name}' with anomaly score of ${billingAnomaly.anomaly_score} and estimated cost of $${billingAnomaly.estimated_cost}.`;
    insights = [
      `Estimated cost increased to $${billingAnomaly.estimated_cost}.`,
      `Recent deploy version for ${billingAnomaly.service_name} was registered by SRE pipeline.`,
      `Recommend: Run cross-source join query to correlate this cost spike with deployment history.`
    ];
    sql = `SELECT service_name, estimated_cost, anomaly_score, timestamp FROM supabase.billing_events WHERE anomaly_score > 0.5 ORDER BY timestamp DESC;`;
  } else if (workerBacklog) {
    explanation = `Queue Backlog: Worker '${workerBacklog.worker_name}' is experiencing high queue depth (${workerBacklog.queue_depth}) and retry count (${workerBacklog.retry_count}) with ${workerBacklog.failed_jobs} failed jobs.`;
    insights = [
      `Worker queue depth is critically high at ${workerBacklog.queue_depth}.`,
      `Accumulated failed jobs reached ${workerBacklog.failed_jobs}.`,
      `Recommend: Scale worker replicas and review failed job logs for database lock conflicts.`
    ];
    sql = `SELECT worker_name, retry_count, failed_jobs, queue_depth, status FROM supabase.worker_events WHERE queue_depth > 50 ORDER BY timestamp DESC;`;
  } else {
    explanation = "System Telemetry Diagnostic: Cluster metrics are operating within normal limits. All 5 Flint databases are synced and responding in under 20ms.";
    insights = [
      "No active OOMKilled or CrashLoopBackOff pods detected.",
      "Cost anomaly scores are below alert threshold limits (< 0.5).",
      "Recommend: Set up proactive monitoring on worker queues and PVC allocations."
    ];
    sql = `SELECT pod_name, namespace, replicas, cpu_usage, status FROM supabase.pod_metrics ORDER BY timestamp DESC LIMIT 5;`;
  }

  return { sql, explanation, insights };
}

app.post("/api/investigate", async (req, res) => {
  const { topic, context } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  console.log(`\n========================================`);
  console.log(`[FLINT AI AGENT] Initiating Inquest Investigation`);
  console.log(`Topic: ${topic}`);
  console.log(`Simulation Mode: ${simulationMode}`);
  console.log(`========================================`);

  try {
    // 1. Fetch live telemetry datasets via Coral SQL engine
    const [pods, deploys, bills, incidents, workers] = await Promise.all([
      queryCoral("SELECT timestamp, pod_name, namespace, replicas, cpu_usage, memory_usage, restart_count, status FROM supabase.pod_metrics ORDER BY id DESC LIMIT 15;"),
      queryCoral("SELECT deployed_at, service_name, version, deployed_by FROM supabase.deployments ORDER BY id DESC LIMIT 5;"),
      queryCoral("SELECT timestamp, service_name, estimated_cost, anomaly_score, severity FROM supabase.billing_events ORDER BY id DESC LIMIT 5;"),
      queryCoral("SELECT created_at, service_name, severity, incident_type, message, resolved FROM supabase.incidents ORDER BY id DESC LIMIT 5;"),
      queryCoral("SELECT timestamp, worker_name, retry_count, failed_jobs, queue_depth, status FROM supabase.worker_events ORDER BY id DESC LIMIT 5;")
    ]);

    const telemetryContext = `
Telemetry Data queried from Coral SQL Engine:

[POD METRICS]
${JSON.stringify(pods)}

[RECENT DEPLOYMENTS]
${JSON.stringify(deploys)}

[ACTIVE INCIDENTS]
${JSON.stringify(incidents)}

[BILLING EVENTS]
${JSON.stringify(bills)}

[WORKER QUEUE EVENTS]
${JSON.stringify(workers)}
`;

    // 2. If no API key is set, use the dynamic local telemetry fallback analysis
    if (!apiKey || apiKey === "MOCK_KEY") {
      console.log("[FLINT AI AGENT] No Gemini key or using fallback. Performing dynamic Flint-based SRE diagnostics locally.");
      const fallbackReport = generateFallbackSreReport(pods, deploys, bills, incidents, workers);
      return res.json({
        success: true,
        ...fallbackReport
      });
    }

    // 3. Otherwise, run the dynamic Flint telemetry context through Gemini
    const ai = getGeminiClient();
    const prompt = `You are Flint-ArcOps AI SRE Investigator, an expert Kubernetes cluster administrator, DevOps engineer, and SQL telemetry investigator.
    
    The user is asking to investigate a telemetry trace anomaly regarding: "${topic}".
    Additional user context: "${context || 'No additional context provided.'}"
    Simulation state mode: "${simulationMode}".

    Below is the live telemetry data queried from Flint SQL engine over the cluster files:
    ${telemetryContext}

    Please inspect this telemetry data to identify the actual root cause of the anomaly. Look for OOMKilled/CrashLoopBackOff pods, high CPU usage pods, pending status, registry errors, recent deployments, queue backlog depth in worker events, or cost spikes in billing events.

    Output a raw JSON response containing three fields:
    1. "sql": A clean, highly realistic SQL query targeting Flint schema (tables: supabase.pod_metrics, supabase.deployments, supabase.worker_events, supabase.billing_events, supabase.incidents) to verify and isolate this specific root cause.
    2. "explanation": A 2-3 sentence technical devops diagnosis explaining the root cause based on the actual telemetry data (e.g. specific pod names, CPU values, namespaces, etc. found in the telemetry data).
    3. "insights": An array of exactly 3 bullet-points providing diagnostic indicators or direct remediation steps for this specific issue.

    Return ONLY the raw JSON object string. Do NOT wrap it in any backticks or markdown markers. Make sure the JSON is perfectly parse-able.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.15,
      }
    });

    const text = response.text || "{}";
    const cleanText = text.trim();
    const data = JSON.parse(cleanText);
    res.json({
      success: true,
      sql: data.sql,
      explanation: data.explanation,
      insights: data.insights || []
    });
  } catch (error: any) {
    console.error("Gemini Inquest error, falling back to local analysis:", error);
    try {
      const [pods, deploys, bills, incidents, workers] = await Promise.all([
        queryCoral("SELECT timestamp, pod_name, namespace, replicas, cpu_usage, memory_usage, restart_count, status FROM supabase.pod_metrics ORDER BY id DESC LIMIT 15;"),
        queryCoral("SELECT deployed_at, service_name, version, deployed_by FROM supabase.deployments ORDER BY id DESC LIMIT 5;"),
        queryCoral("SELECT timestamp, service_name, estimated_cost, anomaly_score, severity FROM supabase.billing_events ORDER BY id DESC LIMIT 5;"),
        queryCoral("SELECT created_at, service_name, severity, incident_type, message, resolved FROM supabase.incidents ORDER BY id DESC LIMIT 5;"),
        queryCoral("SELECT timestamp, worker_name, retry_count, failed_jobs, queue_depth, status FROM supabase.worker_events ORDER BY id DESC LIMIT 5;")
      ]);
      const fallbackReport = generateFallbackSreReport(pods, deploys, bills, incidents, workers);
      res.json({
        success: true,
        ...fallbackReport
      });
    } catch (fallbackErr: any) {
      res.status(500).json({ error: "Failed to perform local telemetry analysis: " + fallbackErr.message });
    }
  }
});

app.post("/api/execute-query", async (req, res) => {
  const { sql } = req.body;
  if (!sql) {
    return res.status(400).json({ error: "Missing SQL query input" });
  }

  // Execute using the local Coral binary with execFile to avoid Windows shell newline issues
  const coralBin = process.platform === "win32" ? "coral.exe" : "coral";
  const coralPath = path.join(process.cwd(), "../backend/coral", coralBin);
  const coralCwd = path.join(process.cwd(), "../backend/coral");

  // Strip -- comments to prevent Coral CLI from throwing "No SQL statements"
  const cleanSql = sql.replace(/--.*$/gm, '').trim();

  console.log(`\n========================================`);
  console.log(`[CORAL SQL ENGINE] Query Execution Request`);
  console.log(`Target command: coral.exe sql --format json -- "${cleanSql}"`);
  console.log(`Cwd: ${coralCwd}`);
  console.log(`========================================`);

  execFile(coralPath, ["sql", "--format", "json", "--", cleanSql], { cwd: coralCwd }, (error, stdout, stderr) => {
    if (error) {
      console.error("Coral exec error:", error, stderr);
      return res.status(500).json({ error: "Coral SQL execution failed: " + stderr });
    }

    try {
      const parsed = JSON.parse(stdout);
      // parsed is an array of objects representing rows.
      // We need to extract columns from the keys of the first row (if any)
      const rows = parsed;
      let columns: string[] = [];
      if (rows.length > 0) {
        columns = Object.keys(rows[0]);
      } else {
        // If empty, we can try to guess columns from the query, or just return empty columns
        columns = []; 
      }

      return res.json({
        success: true,
        columns,
        rows,
        timeMs: Math.floor(Math.random() * 20) + 10 // Mock fast time since we run local
      });
    } catch (parseErr) {
      console.error("Coral parse error:", parseErr, stdout);
      return res.status(500).json({ error: "Failed to parse Coral output" });
    }
  });
});

app.post("/api/execute-recovery", (req, res) => {
  const { command } = req.body;
  if (!command) {
    return res.status(400).json({ error: "Missing recovery command" });
  }

  const isSafeCommand = command.startsWith("kubectl delete pod") || 
                        command.startsWith("kubectl rollout restart") || 
                        command.startsWith("kubectl scale") ||
                        command.includes("kubectl delete");
                        
  if (!isSafeCommand) {
    return res.status(400).json({ error: "Unauthorized or unsafe recovery command signature" });
  }

  console.log(`[RECOVERY] Running shell command: ${command}`);
  
  // If the recovery is deleting the miner, let's also clear simulationMode
  if (command.includes("security-anomaly") || command.includes("miner")) {
    console.log("[RECOVERY] Threat remediated. Resetting simulation mode to none.");
    simulationMode = 'none';
    triggerSimulationEvents('none');
  } else if (command.includes("core-ledger") || command.includes("restart") || command.includes("worker")) {
    console.log("[RECOVERY] Worker restarted. Resetting simulation mode to none and deleting backlog triggers.");
    simulationMode = 'none';
    triggerSimulationEvents('none');
    
    // Dynamically delete the real trigger pod/deployment in the background to prevent poller re-triggering
    exec("kubectl delete pod worker-x-anomaly-pod -n default --ignore-not-found=true && kubectl delete deployment worker-x -n default --ignore-not-found=true", (err) => {
      if (err) console.log("[RECOVERY] No active worker-x triggers to clean up.");
    });
  }

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.warn(`[RECOVERY] Command execution failed (likely running without active kubectl cluster): ${stderr || error.message}`);
      // Return success anyway so the UI transitions nicely even in pure simulation mode
      return res.json({ success: true, output: "Mock execution completed (no active cluster)" });
    }
    return res.json({ success: true, output: stdout });
  });
});

app.post("/api/copilot", async (req, res) => {
  const { message } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  console.log(`\n========================================`);
  console.log(`[SRE CO-PILOT] User Message: ${message}`);
  console.log(`========================================`);

  try {
    const ai = getGeminiClient();
    
    // 1. Planning: Ask Gemini to generate the correct SQL query to retrieve telemetry data
    const planningPrompt = `You are Flint-ArcOps SRE Co-Pilot. The user is asking: "${message}".
    
    Your task is to identify which Flint SQL queries are required to gather information to answer their question.
    Available Flint Tables:
    - supabase.pod_metrics (columns: id, service_name, namespace, pod_name, replicas, cpu_usage, memory_usage, restart_count, status, timestamp)
    - supabase.billing_events (columns: id, service_name, estimated_cost, anomaly_score, severity, timestamp)
    - supabase.deployments (columns: id, deployment_id, service_name, version, deployed_by, deployed_at)
    - supabase.incidents (columns: id, service_name, severity, incident_type, message, resolved, created_at)
    - supabase.worker_events (columns: id, worker_name, retry_count, failed_jobs, queue_depth, status, timestamp)

    Output a raw JSON response containing two fields:
    1. "sql": The exact SQL query to execute on Flint (e.g. to find crashed pods, recent deploys, or billing spikes). Make sure the SQL is valid Flint SQL. Keep it simple and relevant. Limit the output to 10 rows.
    2. "explanation": A 1-sentence description of what this SQL query will search for.

    Return ONLY the raw JSON object string. Do NOT wrap it in any backticks or markdown markers.`;

    let sqlQuery = "";
    let searchExplanation = "";
    
    if (apiKey && apiKey !== "MOCK_KEY") {
      try {
        const planResponse = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: planningPrompt,
          config: {
            responseMimeType: "application/json",
            temperature: 0.1,
          }
        });
        const parsedPlan = JSON.parse(planResponse.text.trim());
        sqlQuery = parsedPlan.sql;
        searchExplanation = parsedPlan.explanation;
      } catch (e) {
        console.error("Co-Pilot planning failed:", e);
      }
    }

    // Default local planning fallbacks if Gemini is not available or failed
    if (!sqlQuery) {
      if (message.toLowerCase().includes("deploy") || message.toLowerCase().includes("billing") || message.toLowerCase().includes("cost")) {
        sqlQuery = "SELECT b.timestamp, b.service_name, b.estimated_cost, d.version FROM supabase.billing_events b JOIN supabase.deployments d ON b.service_name = d.service_name ORDER BY b.timestamp DESC LIMIT 5;";
        searchExplanation = "Joining billing anomalies with deployment history to cross-reference cost changes.";
      } else if (message.toLowerCase().includes("queue") || message.toLowerCase().includes("worker") || message.toLowerCase().includes("backlog")) {
        sqlQuery = "SELECT worker_name, retry_count, failed_jobs, queue_depth, status FROM supabase.worker_events ORDER BY id DESC LIMIT 5;";
        searchExplanation = "Querying worker events to see if any queues are backed up or jobs failed.";
      } else {
        sqlQuery = "SELECT pod_name, namespace, cpu_usage, replicas, status FROM supabase.pod_metrics ORDER BY id DESC LIMIT 5;";
        searchExplanation = "Querying pod metrics to identify crashed or out-of-resource containers.";
      }
    }

    console.log(`[SRE CO-PILOT] Generated SQL query: ${sqlQuery}`);

    // 2. Execution: Execute query on Coral
    const queryResults = await queryCoral(sqlQuery);
    console.log(`[SRE CO-PILOT] Executed query, retrieved ${queryResults.length} rows.`);

    // 3. Synthesis: Feed data back to Gemini to generate the final conversational SRE response
    const synthesisPrompt = `You are Flint-ArcOps SRE Co-Pilot, an expert AI agent designed to help SREs debug clusters and cloud spend using Flint.
    
    User Question: "${message}"
    SRE query run: "${sqlQuery}"
    Search description: "${searchExplanation}"
    
    Real-time data retrieved from Flint SQL Engine:
    ${JSON.stringify(queryResults, null, 2)}

    Please synthesize a helpful SRE response answering the user's question based on the retrieved Flint data. 
    Explain the findings concisely (1-2 paragraphs) pointing to specific services, pod names, costs, or versions if found.
    Then suggest 1-2 direct remediation steps.

    Also, suggest a recovery action command (e.g. a kubectl command like "kubectl scale deployment/core-ledger --replicas=3" or SQL fix) that can be run to resolve the issue.

    Output a raw JSON response containing three fields:
    1. "answer": The markdown response answering the question, including findings and explanations. Keep it concise, SRE-focused, and bulleted if helpful.
    2. "recoveryCommand": A string representing a recommended recovery action command (like a kubectl command or SQL remediation statement) or empty string if none applies.
    3. "remediationLabel": A short 2-3 word label for the recovery button (e.g. "Scale core-ledger" or "Fix DB Lock").

    Return ONLY the raw JSON object string. Do NOT wrap it in any backticks or markdown markers.`;

    let finalAnswer = "";
    let recoveryCommand = "";
    let remediationLabel = "";

    if (apiKey && apiKey !== "MOCK_KEY") {
      try {
        const synthesisResponse = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: synthesisPrompt,
          config: {
            responseMimeType: "application/json",
            temperature: 0.2,
          }
        });
        const parsedSynth = JSON.parse(synthesisResponse.text.trim());
        finalAnswer = parsedSynth.answer;
        recoveryCommand = parsedSynth.recoveryCommand;
        remediationLabel = parsedSynth.remediationLabel;
      } catch (e) {
        console.error("Co-Pilot synthesis failed:", e);
      }
    }

    // Default local synthesis fallbacks if Gemini is not available or failed
    if (!finalAnswer) {
      const hasMiner = queryResults.some(r => JSON.stringify(r).toLowerCase().includes("miner") || JSON.stringify(r).toLowerCase().includes("security-anomaly"));
      if (hasMiner) {
        finalAnswer = `Flint SQL query returned active security anomalies for **unknown-miner** inside the default namespace. Suspicious mining execution logs and 99% CPU cores usage verified.
        
### Remediation Steps:
1. Delete the unapproved mining pod from the namespace.
2. Scan nodes security logs for entry vectors and close public ports.`;
        recoveryCommand = `kubectl delete pod security-anomaly-pod -n default --ignore-not-found=true && kubectl delete pod unknown-miner-pod-x9 -n default --ignore-not-found=true`;
        remediationLabel = "Delete Miner Pod";
      } else if (sqlQuery.includes("billing_events")) {
        const costVal = queryResults.length > 0 ? queryResults[0].estimated_cost : 2150;
        const svcName = queryResults.length > 0 ? queryResults[0].service_name : "ai-chatbot-service";
        const verStr = queryResults.length > 0 ? queryResults[0].version : "v3.0-gemini";
        
        finalAnswer = `Based on the Flint SQL join, I found a cost anomaly in the **${svcName}** ($${costVal} estimated cost). This correlates with deployment version **${verStr}** deployed recently.

### Remediation Steps:
1. Check the Gemini API usage logs to verify if the token consumption matches the cost spike.
2. Implement rate limits on user queries in the chatbot deployment.`;
        recoveryCommand = `kubectl scale deployment/${svcName} --replicas=1`;
        remediationLabel = `Downsize ${svcName}`;
      } else if (sqlQuery.includes("worker_events")) {
        const wrk = queryResults.length > 0 ? queryResults[0] : null;
        if (wrk) {
          finalAnswer = `Flint SQL query returned worker queue **${wrk.worker_name}** with retry count **${wrk.retry_count}** and queue depth **${wrk.queue_depth}**. Its status is **${wrk.status}**.

### Remediation Steps:
1. Check if the database write locks are blocking worker jobs.
2. Restart the worker service to flush the memory leaks.`;
          recoveryCommand = `kubectl rollout restart deployment/${wrk.worker_name}`;
          remediationLabel = `Restart ${wrk.worker_name}`;
        } else {
          finalAnswer = `Flint worker queue check completed. No active backlogs or failed jobs were detected. All systems are operating normally.`;
        }
      } else {
        const crashed = queryResults.length > 0 ? queryResults.find(p => p.status === 'CrashLoopBackOff' || p.status === 'OOMKilled') || queryResults[0] : null;
        if (crashed) {
          finalAnswer = `Flint query returned pod **${crashed.pod_name}** in namespace **${crashed.namespace}** with status **${crashed.status}**. It is consuming ${crashed.cpu_usage || 0}m CPU.

### Remediation Steps:
1. Increase container resource memory limits inside the deployment chart.
2. Check logs for OutOfMemory errors.`;
          recoveryCommand = `kubectl rollout restart deployment/${crashed.pod_name.split("-").slice(0, -2).join("-")} -n ${crashed.namespace}`;
          remediationLabel = "Restart Crashed Service";
        } else {
          finalAnswer = `All k8s cluster namespaces are running normally. No crashed pods were returned in the Flint query metrics.

### Recommendations:
* Enable proactive alerting for PVC storage limits.
* Set up HPA target boundaries.`;
        }
      }
    }

    res.json({
      success: true,
      sql: sqlQuery,
      explanation: searchExplanation,
      rows: queryResults,
      answer: finalAnswer,
      recoveryCommand,
      remediationLabel
    });

  } catch (error: any) {
    console.error("Co-Pilot general execution error:", error);
    res.status(500).json({ error: error.message || "Failed to process Co-Pilot request" });
  }
});

function startK8sPoller() {
  const jsonlPath = path.join(process.cwd(), "../backend/coral/data/pod_metrics/pod_metrics.jsonl");
  setInterval(() => {
    exec("kubectl get pods -A -o json", (err, stdout) => {
      let activePodsMap = new Map();
      let topMap = new Map();

      const parseKubectl = () => {
        try {
          const parsed = JSON.parse(stdout);
          const items = parsed.items || [];
          for (const item of items) {
            const ns = item.metadata.namespace;
            const name = item.metadata.name;
            let status = item.status?.phase || "Unknown";
            const statuses = item.status?.containerStatuses || [];
            let restarts = 0;
            for (const s of statuses) {
              restarts += s.restartCount || 0;
              if (s.state?.waiting?.reason === "CrashLoopBackOff" || s.state?.terminated?.reason === "OOMKilled" || s.state?.waiting?.reason === "ImagePullBackOff") {
                status = s.state.waiting.reason || "Error";
              }
            }
            activePodsMap.set(name, { ns, name, status, restarts });
          }

          // Auto-trigger simulation modes if corresponding pods are detected in real cluster
          let hasRealAnomalyPod = false;
          let hasRealWorkerXPod = false;
          for (const name of activePodsMap.keys()) {
            if (name.includes("security-anomaly-pod")) {
              hasRealAnomalyPod = true;
            }
            if (name.startsWith("worker-x")) {
              hasRealWorkerXPod = true;
            }
          }

          if (hasRealAnomalyPod && simulationMode !== 'crypto') {
            console.log("[POLLER] Detected real security-anomaly-pod in cluster. Activating Crypto Miner simulation.");
            simulationMode = 'crypto';
            triggerSimulationEvents('crypto');
          } else if (hasRealWorkerXPod && simulationMode !== 'backlog') {
            console.log("[POLLER] Detected real worker-x pod in cluster. Activating Queue Backlog simulation.");
            simulationMode = 'backlog';
            triggerSimulationEvents('backlog');
          } else if (!hasRealAnomalyPod && !hasRealWorkerXPod && (simulationMode === 'crypto' || simulationMode === 'backlog')) {
            console.log("[POLLER] Real threat pods cleared from cluster. Returning to Normal Operation.");
            simulationMode = 'none';
          }
        } catch (e) {
          console.error("Poller kubectl parse error:", e);
        }
      };

      const writeRows = () => {
        let lines = "";
        const nowStr = new Date().toISOString();

        for (const pod of BASE_PODS) {
          let status = "Running";
          let cpu = pod.cpuBase + Math.floor(Math.random() * 20) - 10;
          let mem = pod.memBase + Math.floor(Math.random() * 40) - 20;
          let restarts = 0;
          let replicas = pod.replicas;

          const realPodMatch = Array.from(activePodsMap.values()).find((p: any) => p.name.includes(pod.name) || p.name.startsWith(pod.app));
          
          if (realPodMatch) {
            const rm: any = realPodMatch;
            status = rm.status;
            restarts = rm.restarts;
            const topKey = `${rm.ns}/${rm.name}`;
            if (topMap.has(topKey)) {
              const parts = topMap.get(topKey);
              cpu = parseInt(parts[2].replace("m", "")) || cpu;
              mem = parseInt(parts[3].replace("Mi", "")) || mem;
            }
          }

          if (pod.name === "core-ledger-pod-68a8") {
            if (simulationMode === 'backlog') {
              status = "CrashLoopBackOff";
              cpu = 1500 + Math.floor(Math.random() * 300);
              mem = 1200 + Math.floor(Math.random() * 200);
              restarts = 12;
            }
          } else if (pod.name === "unknown-miner-pod-x9") {
            if (simulationMode !== 'crypto' && !realPodMatch) {
              continue;
            }
            status = "Running";
            cpu = 1999 + Math.floor(Math.random() * 100);
            mem = 4096;
            restarts = 0;
          } else if (pod.name === "ai-inference-worker-stuck") {
            if (simulationMode === 'pending') {
              status = "Pending";
              cpu = 0;
              mem = 0;
            } else if (simulationMode !== 'none' && !realPodMatch) {
              continue;
            }
          } else if (pod.name === "payment-gateway-v2-d981") {
            if (simulationMode === 'imagepull') {
              status = "ImagePullBackOff";
              cpu = 10;
              mem = 50;
              restarts = 3;
            }
          } else if (pod.name === "legacy-reporting-job-h9a1") {
            if (simulationMode === 'zombie') {
              status = "Running";
              cpu = 2;
              mem = 10;
            }
          }

          const row = {
            id: Date.now() + Math.floor(Math.random() * 1000),
            service_name: pod.app,
            namespace: pod.namespace,
            pod_name: realPodMatch ? (realPodMatch as any).name : pod.name,
            replicas: replicas,
            cpu_usage: Math.max(0, cpu),
            memory_usage: Math.max(0, mem),
            restart_count: restarts,
            status: status,
            timestamp: nowStr
          };
          lines += JSON.stringify(row) + "\n";
        }

        for (const [name, p] of activePodsMap.entries()) {
          const matchedInBase = BASE_PODS.some(bp => name.includes(bp.name) || name.startsWith(bp.app));
          if (!matchedInBase) {
            let cpu = 50;
            let mem = 128;
            const topKey = `${(p as any).ns}/${name}`;
            if (topMap.has(topKey)) {
              const parts = topMap.get(topKey);
              cpu = parseInt(parts[2].replace("m", "")) || cpu;
              mem = parseInt(parts[3].replace("Mi", "")) || mem;
            }

            if (name.includes("security-anomaly-pod")) {
              cpu = 1999 + Math.floor(Math.random() * 100);
              mem = 4096;
            }

            const row = {
              id: Date.now() + Math.floor(Math.random() * 1000),
              service_name: name.includes("security-anomaly-pod") ? "unknown-miner" : name.split("-").slice(0, 2).join("-"),
              namespace: (p as any).ns,
              pod_name: name,
              replicas: 1,
              cpu_usage: cpu,
              memory_usage: mem,
              restart_count: (p as any).restarts,
              status: (p as any).status,
              timestamp: nowStr
            };
            lines += JSON.stringify(row) + "\n";
          }
        }

        if (lines) {
          fs.appendFileSync(jsonlPath, lines);
        }
      };

      if (!err && stdout) {
        parseKubectl();
        exec("kubectl top pods -A --no-headers", (err2, topStdout) => {
          if (!err2 && topStdout) {
            const lines = topStdout.trim().split("\n");
            for (const line of lines) {
              const parts = line.trim().split(/\s+/);
              if (parts.length >= 4) topMap.set(`${parts[0]}/${parts[1]}`, parts);
            }
          }
          writeRows();
        });
      } else {
        writeRows();
      }
    });
  }, 3000);
}

function startFirewallSimulator() {
  console.log("Starting Firewall Shield Simulator...");
  const coralDir = path.join(process.cwd(), "../backend/coral/data/firewall_events");
  const dataFile = path.join(coralDir, "firewall_events.jsonl");

  if (!fs.existsSync(coralDir)) {
    fs.mkdirSync(coralDir, { recursive: true });
  }

  let eventId = Date.now();

  const protocols = ["TCP/443", "UDP/53", "TLSv1.3", "SSH/22", "HTTP/80", "ICMP", "TCP/8080"];
  const actions = ["ALLOW", "ALLOW", "BLOCK", "BLOCK", "ALLOW", "DROP", "ALLOW"];
  const events = [
    "Internal API heartbeat",
    "Threat DB: Malicious Tor Exit Node",
    "Admin brute-force threshold flag",
    "Google Cloud DNS resolution",
    "Restricted workspace endpoint traverse query",
    "Valid telemetry sync",
    "Cross-site scripting payload drop"
  ];
  const targets = ["us-east-1a", "us-east-1b", "us-east-1c", "us-west-2a"];

  setInterval(() => {
    eventId++;
    const actionIdx = Math.floor(Math.random() * actions.length);
    const event = {
      id: eventId,
      timestamp: new Date().toISOString().slice(11, 19) + 'Z',
      source_ip: `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
      target_node: targets[Math.floor(Math.random() * targets.length)],
      protocol: protocols[Math.floor(Math.random() * protocols.length)],
      action: actions[actionIdx],
      event_desc: events[actionIdx]
    };

    fs.appendFileSync(dataFile, JSON.stringify(event) + "\n");
  }, 4000);
}

// Configure Vite or Serve Static Files
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server started on http://localhost:${PORT}`);
    resetAndPreseedTelemetry();
    startK8sPoller(); // Start the background stream to Coral
  });
}

startServer();
