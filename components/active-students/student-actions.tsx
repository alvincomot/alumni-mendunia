"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteActiveStudent,
  getActiveStudentHistory,
} from "@/app/dashboard/murid-aktif/actions";
import { Button } from "@/components/ui/button";
import { LoadingIndicator } from "@/components/ui/loading";
import { useToast } from "@/components/ui/toast";
import { StudentDialog } from "./student-dialog";
import {
  historyChangeLabels,
  placementStatusLabels,
  trainingStatusLabels,
  type ActiveStudentHistory,
  type ActiveStudentRecord,
} from "@/lib/active-students/schema";
import { formatCountryName } from "@/lib/countries";

type SchoolIdentity = { name: string; npsn: string };

function formatDate(value: string | null) {
  if (!value) return "Belum dicatat";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "long",
    timeZone: "Asia/Jakarta",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00+07:00`));
}

function displayHistoryValue(
  type: ActiveStudentHistory["change_type"],
  value: string | null,
) {
  if (!value) return "Belum dicatat";
  if (type === "training_status" && Object.hasOwn(trainingStatusLabels, value))
    return trainingStatusLabels[value as keyof typeof trainingStatusLabels];
  if (type === "placement_status" && Object.hasOwn(placementStatusLabels, value))
    return placementStatusLabels[value as keyof typeof placementStatusLabels];
  if (type === "placement_country") return formatCountryName(value);
  if (type === "placement_date") return formatDate(value);
  return value;
}

function DetailDialog({ student }: { student: ActiveStudentRecord }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<ActiveStudentHistory[]>([]);
  const [message, setMessage] = useState("");

  async function open() {
    setHistory([]);
    setMessage("");
    setLoading(true);
    dialog.current?.showModal();
    try {
      const result = await getActiveStudentHistory(student.id);
      if (result.success) setHistory(result.history);
      else setMessage(result.message);
    } catch {
      setMessage("Riwayat belum dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={open} aria-label={`Detail ${student.full_name}`}>
        Detail
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby={`student-detail-${student.id}`}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-xl border bg-card p-5 text-foreground backdrop:bg-slate-950/45 sm:p-6"
      >
        <div className="flex items-start justify-between gap-4 pr-10">
          <div>
            <h2 id={`student-detail-${student.id}`} className="type-section-title text-primary">{student.full_name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Detail murid aktif dan riwayat perubahan status.</p>
          </div>
        </div>
        <Button type="button" size="icon" variant="ghost" className="absolute right-3 top-3" aria-label="Tutup detail" onClick={() => dialog.current?.close()}>
          <span aria-hidden="true" className="text-xl leading-none">×</span>
        </Button>

        <dl className="mt-6 grid gap-x-6 gap-y-4 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Sekolah", student.schools?.name ?? "Sekolah tidak tersedia"],
            ["NPSN", student.schools?.npsn ?? "-"],
            ["Konsentrasi keahlian", student.skill_concentration],
            ["Kelas", `Kelas ${student.grade}`],
            ["Status KJP", student.kjp_status == null ? "Belum dicatat" : student.kjp_status ? "Ya" : "Tidak"],
            ["Tahun Pendataan", String(student.data_year)],
            ["Status pelatihan", trainingStatusLabels[student.training_status]],
            ["LKP / SO / P3MI", student.provider_name ?? "Belum dicatat"],
            ["Status penempatan", placementStatusLabels[student.placement_status]],
            ["Negara penempatan", student.placement_country ? formatCountryName(student.placement_country) : "Belum dicatat"],
            ["Tanggal penempatan", formatDate(student.placement_date)],
            ["Persetujuan wali", `Dikonfirmasi ${formatDate(student.parent_consent_at)}`],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="type-meta text-muted-foreground">{label}</dt>
              <dd className="mt-1 break-words font-medium">{value}</dd>
            </div>
          ))}
        </dl>

        <section className="mt-6 border-t pt-5" aria-labelledby={`student-history-${student.id}`}>
          <h3 id={`student-history-${student.id}`} className="type-card-title text-primary">Riwayat perubahan</h3>
          {loading ? (
            <p role="status" className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><LoadingIndicator size="sm" /> Memuat riwayat...</p>
          ) : message ? (
            <p role="alert" className="mt-4 text-sm text-red-800">{message}</p>
          ) : history.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">Belum ada riwayat perubahan.</p>
          ) : (
            <ol className="mt-4 divide-y rounded-xl border px-4">
              {history.map((item) => (
                <li key={item.id} className="py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold">{historyChangeLabels[item.change_type]}</p>
                    <time className="type-meta text-muted-foreground" dateTime={item.changed_at}>
                      {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(item.changed_at))} WIB
                    </time>
                  </div>
                  <p className="mt-1 text-sm">
                    {displayHistoryValue(item.change_type, item.old_value)} <span aria-hidden="true">→</span> {displayHistoryValue(item.change_type, item.new_value)}
                  </p>
                  <p className="mt-1 type-meta text-muted-foreground">Oleh {item.changed_by_name ?? "Akun tidak tersedia"}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
        <div className="mt-6 flex justify-end border-t pt-5">
          <Button type="button" variant="outline" onClick={() => dialog.current?.close()}>Tutup</Button>
        </div>
      </dialog>
    </>
  );
}

function DeleteDialog({ student }: { student: ActiveStudentRecord }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  const { toast } = useToast();

  async function remove() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setMessage("");
    try {
      const result = await deleteActiveStudent(student.id);
      if (result.success) {
        dialog.current?.close();
        toast(result.message);
        router.refresh();
      } else {
        setMessage(result.message);
      }
    } catch {
      setMessage("Penghapusan belum dapat diselesaikan. Silakan coba kembali.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <>
      <Button type="button" variant="destructive" onClick={() => { setMessage(""); dialog.current?.showModal(); }} aria-label={`Hapus permanen ${student.full_name}`}>
        Hapus
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby={`student-delete-${student.id}`}
        aria-describedby={`student-delete-impact-${student.id}`}
        onCancel={(event) => { if (pending) event.preventDefault(); }}
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl border bg-card p-5 text-foreground backdrop:bg-slate-950/45 sm:p-6"
      >
        <h2 id={`student-delete-${student.id}`} className="type-section-title text-primary">Hapus data murid permanen?</h2>
        <p id={`student-delete-impact-${student.id}`} className="mt-3 text-sm leading-6">
          <strong>{student.full_name}</strong> dari {student.schools?.name ?? "sekolah ini"} akan dihapus beserta seluruh riwayat statusnya. Tindakan ini tidak dapat dibatalkan.
        </p>
        {message && <p role="alert" className="mt-4 text-sm text-red-800">{message}</p>}
        <div className="mt-6 flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" disabled={pending} onClick={() => dialog.current?.close()}>Batal</Button>
          <Button type="button" variant="destructive" disabled={pending} onClick={remove}>
            {pending && <LoadingIndicator size="sm" />}
            {pending ? "Menghapus..." : "Hapus Permanen"}
          </Button>
        </div>
      </dialog>
    </>
  );
}

export function StudentRowActions({
  student,
  school,
  canWrite,
}: {
  student: ActiveStudentRecord;
  school: SchoolIdentity;
  canWrite: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <DetailDialog student={student} />
      {canWrite && (
        <>
          <StudentDialog student={student} school={school} />
          <DeleteDialog student={student} />
        </>
      )}
    </div>
  );
}

