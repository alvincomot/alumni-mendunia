"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  completeActiveStudentTraining,
  deleteActiveStudent,
} from "@/app/dashboard/murid-aktif/actions";
import { Button } from "@/components/ui/button";
import { LoadingIndicator } from "@/components/ui/loading";
import { useToast } from "@/components/ui/toast";
import { StudentDialog } from "./student-dialog";
import { type ActiveStudentRecord } from "@/lib/active-students/schema";
import { activeStudentDetailPath } from "@/lib/active-students/navigation";

type SchoolIdentity = { name: string; npsn: string };

export function DeleteStudentDialog({
  student,
  successPath,
  triggerLabel = "Hapus",
}: {
  student: ActiveStudentRecord;
  successPath?: string;
  triggerLabel?: string;
}) {
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
        if (successPath) router.push(successPath);
        else router.refresh();
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
        {triggerLabel}
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

export function CompleteTrainingDialog({
  student,
}: {
  student: ActiveStudentRecord;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  const { toast } = useToast();

  async function complete() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setMessage("");
    try {
      const result = await completeActiveStudentTraining({
        id: student.id,
        expected_updated_at: student.updated_at,
      });
      if (result.success) {
        dialog.current?.close();
        toast(result.message);
        router.refresh();
      } else {
        setMessage(result.message);
        if (result.refresh) router.refresh();
      }
    } catch {
      setMessage(
        "Koneksi bermasalah. Muat ulang data sebelum mencoba kembali.",
      );
      router.refresh();
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => {
          setMessage("");
          dialog.current?.showModal();
        }}
        aria-label={`Selesaikan Pelatihan: ${student.full_name}`}
      >
        Selesaikan Pelatihan
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby={`student-complete-training-${student.id}`}
        aria-describedby={`student-complete-training-impact-${student.id}`}
        onCancel={(event) => {
          if (pending) event.preventDefault();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl border bg-card p-5 text-foreground backdrop:bg-slate-950/45 sm:p-6"
      >
        <h2
          id={`student-complete-training-${student.id}`}
          className="type-section-title text-primary"
        >
          Selesaikan Pelatihan
        </h2>
        <p
          id={`student-complete-training-impact-${student.id}`}
          className="mt-3 text-sm leading-6"
        >
          Status pelatihan <strong>{student.full_name}</strong> akan diubah dari
          Aktif Pelatihan menjadi Sudah Selesai Pelatihan. Perubahan ini akan
          dicatat dalam riwayat.
        </p>
        {message && (
          <p role="alert" className="mt-4 text-sm text-red-800">
            {message}
          </p>
        )}
        <div className="mt-6 flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => dialog.current?.close()}
          >
            Kembali
          </Button>
          <Button type="button" disabled={pending} onClick={complete}>
            {pending && <LoadingIndicator size="sm" />}
            {pending ? "Menyimpan..." : "Ya, selesaikan"}
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
  returnTo,
}: {
  student: ActiveStudentRecord;
  school: SchoolIdentity;
  canWrite: boolean;
  returnTo: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="outline">
        <Link href={activeStudentDetailPath(student.id, returnTo)}>
          Detail
        </Link>
      </Button>
      {canWrite && (
        <>
          {student.training_status === "aktif_pelatihan" && (
            <CompleteTrainingDialog student={student} />
          )}
          <StudentDialog student={student} school={school} />
          <DeleteStudentDialog student={student} />
        </>
      )}
    </div>
  );
}

