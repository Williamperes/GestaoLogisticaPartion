"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { Dialog } from "@base-ui/react/dialog";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type DeleteConfirmAction = (formData: FormData) => void | Promise<void>;

interface DeleteConfirmDialogProps {
  action: DeleteConfirmAction;
  itemId: string;
  itemName: string;
  itemLabel: string;
  hiddenFieldName?: string;
  extraFields?: Record<string, string>;
  title?: string;
  description?: string;
  confirmLabel?: string;
  pendingLabel?: string;
  render: React.ReactElement;
  children?: React.ReactNode;
}

export function DeleteConfirmDialog({
  action,
  itemId,
  itemName,
  itemLabel,
  hiddenFieldName = "id",
  extraFields,
  title,
  description,
  confirmLabel,
  pendingLabel,
  render,
  children,
}: DeleteConfirmDialogProps) {
  const resolvedTitle = title ?? `Apagar ${itemLabel}`;
  const resolvedDescription =
    description ?? `Esta ação remove ${itemLabel} ${itemName} e não pode ser desfeita.`;
  const resolvedConfirmLabel = confirmLabel ?? `Apagar ${itemLabel}`;
  const resolvedPendingLabel = pendingLabel ?? "Apagando...";

  return (
    <Dialog.Root>
      <Dialog.Trigger render={render}>{children}</Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Backdrop
          className={cn(
            "fixed inset-0 z-50 bg-black/20 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs"
          )}
        />

        <Dialog.Popup
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[28px] border border-border bg-[color:color-mix(in_srgb,var(--card)_94%,white)] p-6 text-sm text-foreground shadow-[0_30px_80px_rgba(17,17,17,0.18)] transition duration-200 ease-in-out data-ending-style:opacity-0 data-ending-style:scale-[0.98] data-starting-style:opacity-0 data-starting-style:scale-[0.98]"
          )}
        >
          <div className="space-y-5">
            <div className="flex items-start gap-4">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10 text-red-600">
                <AlertTriangle className="h-5 w-5" />
              </div>

              <div className="min-w-0 space-y-1">
                <Dialog.Title className="text-base font-semibold text-foreground">
                  {resolvedTitle}
                </Dialog.Title>
                <Dialog.Description className="text-sm leading-6 text-muted-foreground">
                  {resolvedDescription}
                </Dialog.Description>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-background/70 px-4 py-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{itemName}</span>
            </div>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Dialog.Close
                render={<Button type="button" variant="outline" className="h-11 rounded-2xl px-5 text-sm font-semibold" />}
              >
                Cancelar
              </Dialog.Close>

              <form action={action}>
                <input type="hidden" name={hiddenFieldName} value={itemId} />
                {extraFields &&
                  Object.entries(extraFields).map(([fieldName, fieldValue]) => (
                    <input
                      key={fieldName}
                      type="hidden"
                      name={fieldName}
                      value={fieldValue}
                    />
                  ))}
                <DeleteConfirmSubmitButton
                  confirmLabel={resolvedConfirmLabel}
                  pendingLabel={resolvedPendingLabel}
                />
              </form>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DeleteConfirmSubmitButton({
  confirmLabel,
  pendingLabel,
}: {
  confirmLabel: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant="destructive"
      disabled={pending}
      className="h-11 rounded-2xl px-5 text-sm font-semibold"
    >
      {pending ? pendingLabel : confirmLabel}
    </Button>
  );
}
