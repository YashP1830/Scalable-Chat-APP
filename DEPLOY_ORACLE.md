# Deploying ChatAppScalable free on Oracle Cloud (Always Free VM)

Goal: move the heavy stack (Kafka + Redis + 3 API instances + workers + nginx)
off your laptop onto a **free-forever** Arm VM, then load-test it with k6 from
your laptop.

Why Oracle: the Always Free Ampere A1 VM has no 12-month expiry (unlike AWS/GCP).
As of mid-2026 the free allowance is **2 OCPU / 12 GB RAM** — plenty for this
whole stack. Free managed Kafka no longer exists (Upstash Kafka shut down), so a
single VM running your `docker-compose` is the right free approach.

---

## 1. Create the VM

1. Sign up at https://www.oracle.com/cloud/free/ (needs a card for identity; the
   Always Free resources are never charged).
2. Console → **Compute → Instances → Create Instance**.
3. Image & shape:
   - **Image:** Ubuntu 22.04 (or 24.04).
   - **Shape:** change to **Ampere (Arm)** → `VM.Standard.A1.Flex` → set **2 OCPU
     / 12 GB**.
   - If you hit **"Out of host capacity"**, switch region to **Frankfurt** or
     **Singapore** (they provision fastest) and retry, or try again later.
4. **Add your SSH key** (paste your public key, or download the generated one).
5. Create. Note the **Public IP address** once it's running.

---

## 2. Open the firewall (two layers — both matter)

**a) Oracle security list (cloud firewall):**
Networking → your VCN → Security Lists → default → **Add Ingress Rules**:
- Source `0.0.0.0/0`, IP Protocol **TCP**, Destination port **80** (the app).
- (SSH port 22 is usually already open.)

**b) The VM's own firewall (Ubuntu ships with iptables rules on OCI):**
```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo netfilter-persistent save
```

---

## 3. Install Docker on the VM

SSH in first: `ssh ubuntu@<VM_PUBLIC_IP>`

```bash
sudo apt-get update && sudo apt-get upgrade -y
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker      # apply the group without logging out
docker --version && docker compose version
```

---

## 4. Get the code onto the VM

Easiest is to push your project to a GitHub repo, then:
```bash
git clone https://github.com/<you>/ChatAppScalable.git
cd ChatAppScalable
```

You must also create `backend/.env` on the VM (it's gitignored). Copy your local
one over, e.g. from your laptop:
```bash
scp backend/.env ubuntu@<VM_PUBLIC_IP>:~/ChatAppScalable/backend/.env
```

In that `backend/.env` on the VM, make sure:
- `MONGODB_URI` points at your Atlas cluster (add the VM's IP, or `0.0.0.0/0`
  for a test, under Atlas → Network Access).
- `CLIENT_URL=http://<VM_PUBLIC_IP>` (used for CORS if you open it in a browser).
- For browser login over plain HTTP, set `NODE_ENV=development` (otherwise the
  auth cookie is marked `Secure` and browsers drop it on http). k6 doesn't care —
  it reads the cookie manually.

---

## 5. Launch the stack

Normal (protected) run:
```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Watch it come up (Kafka takes ~30–60s):
```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f db-worker analytics-worker
```

Verify from your laptop:
```bash
curl http://<VM_PUBLIC_IP>/healthz      # → ok
```

---

## 6. Load-test it with k6

k6 runs on **your laptop** (generating load is light) and points at the VM.

**First, relaunch the VM stack with ArcJet in DRY_RUN** so k6 isn't blocked as a
bot / rate-limited:
```bash
# on the VM
ARCJET_MODE=DRY_RUN docker compose -f docker-compose.prod.yml up -d
```

Install k6 locally (Windows): `winget install k6` (or see https://k6.io/docs).

Run the test (from your project folder on your laptop):
```bash
k6 run -e BASE_URL=http://<VM_PUBLIC_IP> loadtest.k6.js
```

### Reading the results
- `http_req_duration ... p(95)` — 95th-percentile latency. The threshold fails
  (red) if p95 > 800ms; that's your signal the box is saturating.
- `http_req_failed` — error rate; should stay < 2%.
- `msg_send_duration` — isolates the write path (Kafka produce + Redis append).
- `iterations` / `vus` — throughput and concurrency reached.

While it runs, on the VM watch the pressure and confirm the pipeline works:
```bash
docker stats                                   # CPU/RAM per container
docker compose -f docker-compose.prod.yml logs -f db-worker   # 💾 Persisted ...
```
With only 2 OCPUs, expect CPU to hit ~100% around 50–100 VUs — that saturation
point *is* the interesting result. To show horizontal scaling, compare runs
after editing `nginx/nginx.conf` + compose to use 1 vs 3 API instances.

**Turn protection back on when done:**
```bash
docker compose -f docker-compose.prod.yml up -d   # ARCJET_MODE defaults to LIVE
```

---

## 7. Point the real frontend at the VM (optional)

To click through the UI against the deployed backend, set your local
`frontend/.env`:
```
VITE_API_URL=http://<VM_PUBLIC_IP>/api
```
then `cd frontend && npm run dev`. (Remember the `NODE_ENV=development` note in
step 4 for cookie login to work over http.)

---

## Cost & safety notes
- Always Free resources are never billed. To be safe, in **Billing → Budgets**
  set a $1 alert so any accidental paid resource pings you.
- If the instance sits idle, Oracle may reclaim *idle* Always Free VMs — keeping
  the stack running (or a light cron) avoids that.
- This test box runs over plain HTTP. Don't put real user data on it. For a
  proper HTTPS front door later, add Caddy or Nginx with a free Let's Encrypt
  cert and a domain.
