import { FormEvent, useState } from "react";
import toast from "react-hot-toast";
import { changePassword } from "@/api/auth";
import { useModal } from "../../hooks/useModal";
import { Modal } from "../ui/modal";
import Button from "../ui/button/Button";
import Input from "../form/input/InputField";
import Label from "../form/Label";

export default function UserPasswordCard() {
  const { isOpen, openModal, closeModal } = useModal();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError("");
  };

  const handleOpen = () => {
    resetForm();
    openModal();
  };

  const handleClose = () => {
    if (saving) return;
    resetForm();
    closeModal();
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    if (newPassword.length < 8) {
      setError("New password must contain at least 8 characters.");
      return;
    }

    if (!/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      setError("New password must contain at least one letter and one number.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    if (currentPassword === newPassword) {
      setError("New password must be different from current password.");
      return;
    }

    setSaving(true);

    try {
      await changePassword(currentPassword, newPassword);
      toast.success("Password changed successfully.");
      resetForm();
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="p-5 border border-gray-200 rounded-2xl dark:border-gray-800 lg:p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="ml-6">
            <h4 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Password
            </h4>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Change your password to keep your account secure.
            </p>
          </div>

          <button
            onClick={handleOpen}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 hover:text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-200 lg:inline-flex lg:w-auto"
          >
            Change Password
          </button>
        </div>
      </div>

      <Modal isOpen={isOpen} onClose={handleClose} className="max-w-[600px] m-4">
        <div className="w-full rounded-3xl bg-white p-6 dark:bg-gray-900">
          <h4 className="mb-2 text-xl font-semibold text-gray-800 dark:text-white/90">
            Change Password
          </h4>

          <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
            Enter your current password and choose a new one.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <Label>Current Password</Label>
              <Input
                type="password"
                name="currentPassword"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={saving}
                required
              />
            </div>

            <div>
              <Label>New Password</Label>
              <Input
                type="password"
                name="newPassword"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={saving}
                required
                hint="At least 8 characters, including one letter and one number."
              />
            </div>

            <div>
              <Label>Confirm New Password</Label>
              <Input
                type="password"
                name="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={saving}
                required
              />
            </div>

            {error && (
              <p className="text-sm text-error-500 dark:text-error-400">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <Button size="sm" variant="outline" onClick={handleClose} disabled={saving}>
                Cancel
              </Button>
              <Button size="sm" type="submit" disabled={saving}>
                {saving ? "Changing..." : "Change Password"}
              </Button>
            </div>
          </form>
        </div>
      </Modal>
    </>
  );
}