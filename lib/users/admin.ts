import "server-only";
import { createClient } from "@supabase/supabase-js";

class AdministrationError extends Error {}

export function administrationMessage(error: unknown): string {
  if (error instanceof AdministrationError) return error.message;
  const failure = error && typeof error === "object" ? error : {};
  const code = "code" in failure ? failure.code : undefined;
  const status = "status" in failure ? failure.status : undefined;
  if (status === 401 || status === 403 || code === "not_admin")
    return "Akses layanan Auth ditolak. Administrator server perlu memeriksa SUPABASE_SECRET_KEY dan kecocokan proyek Supabase.";
  if (
    status === 429 ||
    code === "over_email_send_rate_limit" ||
    code === "over_request_rate_limit"
  )
    return "Batas permintaan atau pengiriman email tercapai. Tunggu sebelum mencoba lagi dan periksa batas pengiriman Supabase.";
  if (code === "email_address_not_authorized")
    return "Layanan email bawaan membatasi alamat penerima. Konfigurasikan SMTP khusus atau gunakan alamat uji yang diizinkan oleh Supabase.";
  if (code === "email_provider_disabled")
    return "Penyedia email Auth belum aktif. Administrator server perlu memeriksa konfigurasi email Supabase.";
  if (code === "email_address_invalid" || code === "validation_failed")
    return "Alamat email ditolak oleh layanan Auth. Periksa kembali alamat penerima.";
  if (
    code === "email_exists" ||
    code === "user_already_exists" ||
    code === "conflict"
  )
    return "Akun sudah tersedia atau berubah saat permintaan diproses. Muat ulang daftar; edit profil yang ada atau pilih pemulihan profil tanpa mengirim ulang undangan.";
  return "Layanan Auth belum dapat menyelesaikan permintaan. Periksa koneksi, log Auth, serta SMTP dan pengirim email di Supabase. Detail layanan tidak ditampilkan di aplikasi.";
}

// Callers must independently authorize the current administrator before using this client.
export function createAdminClient() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret || !process.env.NEXT_PUBLIC_SUPABASE_URL)
    throw new AdministrationError(
      "Direktori email belum dikonfigurasi. Administrator server perlu mengatur SUPABASE_SECRET_KEY dan NEXT_PUBLIC_SUPABASE_URL, lalu memulai ulang atau melakukan redeploy aplikasi.",
    );
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, secret, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function invitationRedirect() {
  let url: URL;
  try {
    url = new URL(process.env.APP_SITE_URL || "");
  } catch {
    throw new AdministrationError(
      "Undangan baru belum tersedia. Atur APP_SITE_URL ke origin deployment dan daftarkan URL /auth/confirm di Supabase Auth.",
    );
  }
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      ))
  )
    throw new AdministrationError(
      "APP_SITE_URL harus berupa origin HTTPS tanpa path, query, atau kredensial. HTTP hanya diizinkan untuk localhost.",
    );
  return `${url.origin}/auth/confirm`;
}

export async function listAuthUsers(
  admin: ReturnType<typeof createAdminClient>,
) {
  const users: { id: string; email?: string }[] = [];
  const ids = new Set<string>();
  let expectedTotal: number | undefined;
  // Explicit page numbers avoid relying on the SDK's Link-header page parsing.
  for (let page = 1; page <= 101; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 100,
    });
    if (error) throw error;
    if (data.total > 0) {
      if (expectedTotal !== undefined && expectedTotal !== data.total)
        throw new AdministrationError(
          "Direktori Auth berubah saat dimuat. Muat ulang daftar sebelum melanjutkan.",
        );
      expectedTotal = data.total;
    }
    for (const user of data.users) {
      if (ids.has(user.id))
        throw new AdministrationError(
          "Direktori Auth berubah saat dimuat. Muat ulang daftar sebelum melanjutkan.",
        );
      ids.add(user.id);
      users.push({ id: user.id, email: user.email });
    }
    if (users.length > 10_000 || (expectedTotal ?? 0) > 10_000)
      throw new AdministrationError(
        "Direktori Auth melebihi batas prototipe 10.000 akun. Administrator perlu meninjau kapasitas sebelum melanjutkan.",
      );
    if (expectedTotal !== undefined && users.length === expectedTotal)
      return users;
    if (data.users.length < 100) {
      if (expectedTotal !== undefined && users.length !== expectedTotal)
        throw new AdministrationError(
          "Direktori Auth belum termuat lengkap. Muat ulang daftar sebelum melanjutkan.",
        );
      return users;
    }
  }
  throw new AdministrationError(
    "Direktori Auth belum termuat lengkap. Muat ulang daftar sebelum melanjutkan.",
  );
}
