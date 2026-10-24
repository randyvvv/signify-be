# Panduan deploy signify-api ke Google Cloud Run

Panduan ini memindahkan backend Signify (`signify-api`) dari Railway ke Google Cloud Run. Frontend tetap di Vercel; yang berubah hanya alamat API yang dipakai frontend.

Seluruh langkah berat dijalankan oleh satu skrip: `scripts/deploy-cloudrun.mjs`. Skrip ini membaca file `.env`, menyimpan rahasia ke Secret Manager, menulis konfigurasi, lalu build dan deploy.

## 1. Yang perlu disiapkan

| Kebutuhan | Keterangan |
|---|---|
| Akses project GCP | Role **Owner**, atau kombinasi: Cloud Run Admin, Cloud Build Editor, Artifact Registry Admin, Secret Manager Admin, Service Usage Admin, Service Account User. Billing project harus aktif. |
| Google Cloud SDK | `gcloud --version` harus jalan. Instal dari https://cloud.google.com/sdk/docs/install |
| Node.js 20 atau lebih baru | Untuk menjalankan skrip deploy (`node --version`). |
| Repo `signify-be` terbaru | Harus sudah berisi `Dockerfile` dan `scripts/deploy-cloudrun.mjs`. |
| File `.env` | Dikirim Randy lewat jalur pribadi. Taruh di folder `signify-be`. **Jangan di-commit, jangan dikirim ke grup.** |

> **Penting tentang `JWT_SECRET`:** nilainya sebaiknya sama dengan yang dipakai di Railway. Kalau berbeda, semua pengguna akan ter-logout dan harus login ulang (data tidak hilang).

## 2. Deploy

```bash
cd signify-be
gcloud auth login
gcloud config set project <PROJECT_ID>

# Lihat rencananya dulu. Tidak ada yang diubah, dan nilai rahasia tidak ditampilkan.
node scripts/deploy-cloudrun.mjs --project <PROJECT_ID> --dry-run

# Deploy sungguhan (sekitar 3–6 menit).
node scripts/deploy-cloudrun.mjs --project <PROJECT_ID>
```

Di akhir, skrip menampilkan URL backend, misalnya `https://signify-api-xxxxxxxx.asia-southeast1.run.app`, dan hasil cek `/health`. Hasil yang benar: `HTTP 200 {"status":"ok"}`.

Opsi tambahan skrip:

| Opsi | Default | Fungsi |
|---|---|---|
| `--region` | `asia-southeast1` | Region Cloud Run. Singapura dipilih karena database Supabase juga di Singapura. |
| `--service` | `signify-api` | Nama service Cloud Run. |
| `--min-instances` | `1` | Jumlah instance yang selalu menyala. Pakai `0` setelah masa demo untuk menghemat biaya. |
| `--env` | `.env` | Lokasi file env. |
| `--skip-secrets` | – | Lewati pembaruan rahasia, pakai versi yang sudah ada. |
| `--dry-run` | – | Tampilkan rencana tanpa mengubah apa pun. |

### Apa saja yang dilakukan skrip

1. Mengaktifkan API Cloud Run, Cloud Build, Artifact Registry, dan Secret Manager.
2. Menyimpan rahasia ke **Secret Manager**: `DATABASE_URL`, `JWT_SECRET`, `GEMINI_API_KEY`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `YT_TRANSCRIPT_IO_TOKEN`. Nilainya dikirim lewat stdin, jadi tidak muncul di layar, log, atau file. Kalau secret sudah ada dan nilainya sama, tidak dibuat versi baru.
3. Memberi service account runtime (`<PROJECT_NUMBER>-compute@developer.gserviceaccount.com`) izin membaca setiap secret tersebut.
4. Menulis variabel non-rahasia ke `cloudrun.env.yaml` (sudah di-gitignore). `PORT`, `SEED_RESET`, nilai kosong, dan URL yang bukan alamat publik dilewati.
5. Menjalankan `gcloud run deploy --source .`: Cloud Build membangun image dari `Dockerfile`, lalu Cloud Run menjalankannya. Saat menyala, container menjalankan migrasi database dulu (sama seperti di Railway), baru server.
6. Mengecek `/health` di URL baru.

## 3. Mengarahkan frontend ke backend baru

Langkah ini dikerjakan oleh orang yang punya akses ke project Vercel `signify-fe`:

1. Vercel → Project `signify-fe` → Settings → Environment Variables.
2. Ubah `NEXT_PUBLIC_API_URL` menjadi URL Cloud Run (tanpa garis miring di akhir).
3. Redeploy frontend. Variabel `NEXT_PUBLIC_*` baru berlaku setelah build ulang.

Kelas Live otomatis mengikuti, karena alamat WebSocket diturunkan dari `NEXT_PUBLIC_API_URL` (`https://` menjadi `wss://…/api/live/ws`).

## 4. Daftar uji setelah pindah

- [ ] `https://<url>/health` membalas `{"status":"ok"}`, dan `https://<url>/docs` menampilkan Swagger.
- [ ] Login dengan email dan dengan Google di www.ai-signify.com.
- [ ] Signa: klik *Prepare for a job interview*, langkah-langkahnya muncul real-time.
- [ ] Live Translator: *Text → Sign*, avatar berisyarat. *Sign → Voice*: tombol *Speak* mengeluarkan suara.
- [ ] Kelas Live dengan dua perangkat (guru dan murid): caption, avatar, chat, dan kamera berjalan.
- [ ] Kelas selesai → *Turn into material* menghasilkan artikel dan kuis.

## 5. Kenapa pengaturannya begini

| Pengaturan | Alasan |
|---|---|
| `--max-instances 1` | Ruang Kelas Live disimpan di memori server. Kalau ada dua instance, guru dan murid bisa masuk ke instance yang berbeda dan tidak saling terhubung. |
| `--concurrency 1000` | Setiap koneksi WebSocket murid dihitung sebagai satu request. Default 80 terlalu kecil untuk kelas besar. |
| `--timeout 3600` | Batas maksimum Cloud Run. WebSocket diputus setelah 60 menit, lalu frontend menyambung ulang sendiri. Untuk kelas lebih dari 1 jam, cek apakah guru perlu menekan tombol mikrofon lagi. |
| `--min-instances 1`, `--no-cpu-throttling` | Tidak ada cold start, dan cache di memori tetap hangat. Konsekuensinya: ada biaya instance yang menyala terus. |
| `--cpu 1 --memory 1Gi` | Cukup untuk transkripsi live dan beberapa kelas bersamaan. |
| Region `asia-southeast1` | Dekat dengan database Supabase (Singapura). |
| Gemini lewat API key | Sama seperti di Railway: `GEMINI_API_KEY` terikat ke service account Vertex AI, jadi tetap jalan walau Cloud Run ada di project lain. |

## 6. Deploy ulang, rollback, dan biaya

- **Deploy ulang** setelah ada perubahan kode: `git pull`, lalu jalankan skrip yang sama. Tambahkan `--skip-secrets` kalau `.env` tidak berubah.
- **Rollback cepat:** di Cloud Run → service `signify-api` → *Revisions* → pilih revisi sebelumnya → *Manage traffic* → 100%. Atau kembalikan `NEXT_PUBLIC_API_URL` di Vercel ke URL Railway.
- **Railway:** biarkan tetap hidup sampai semua uji di bagian 4 lolos dan masa Grand Final (29–30 Oktober 2026) lewat. Setelah itu matikan, supaya tidak ada dua backend yang memakai database yang sama.
- **Biaya:** setelah masa demo, turunkan instance yang selalu menyala:
  ```bash
  gcloud run services update signify-api --region asia-southeast1 --min-instances 0
  ```

## 7. Kalau ada masalah

| Gejala | Penyebab dan solusi |
|---|---|
| `PERMISSION_DENIED` saat build | Service account build belum punya izin. Jalankan: `gcloud projects add-iam-policy-binding <PROJECT_ID> --member=serviceAccount:<PROJECT_NUMBER>-compute@developer.gserviceaccount.com --role=roles/run.builder`, lalu ulangi skrip. |
| Gagal saat `--allow-unauthenticated` | Kebijakan organisasi melarang akses publik (`allUsers`). Minta admin organisasi mengizinkannya untuk project ini, atau gunakan project tanpa organisasi. |
| Frontend kena error CORS | `CORS_ORIGIN` harus memuat `https://www.ai-signify.com`. Skrip menambahkannya otomatis bila belum ada; cek isi `cloudrun.env.yaml`. |
| Container gagal start, log menyebut database | Cek `DATABASE_URL` (pakai connection string pooler Supabase, port 6543). Log: Cloud Run → `signify-api` → *Logs*. |
| Signa, chatbot, atau caption error | Cek `GEMINI_API_KEY` dan `VERTEX_PROJECT`, serta pastikan `AI_ENABLED` bernilai `true`. |
| Video Kelas Live tidak muncul | Cek `LIVEKIT_URL`, `LIVEKIT_API_KEY`, dan `LIVEKIT_API_SECRET`. |
| Pengguna ter-logout semua | `JWT_SECRET` berbeda dengan Railway. Samakan nilainya di `.env`, lalu jalankan skrip lagi. |
