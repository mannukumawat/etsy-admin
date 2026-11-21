import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/Form';
import { usePageMeta } from '@/hooks/misc';
import { errorMessage } from '@/services/api';
import { authService } from '@/services/settingsService';

const schema = z
  .object({
    password: z.string().min(8, 'Use at least 8 characters.').max(200),
    confirm: z.string().min(1, 'Repeat your new password.'),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match.' });
type Values = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  usePageMeta('Choose a new password');
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { password: '', confirm: '' } });

  const onSubmit = async ({ password }: Values) => {
    setError(null);
    try {
      await authService.resetPassword(token, password);
      setDone(true);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <div className="w-full max-w-md">
      <p className="mb-6 text-center font-brand text-3xl font-semibold">Your Store</p>
      <div className="card p-6 sm:p-7">
        <h1 className="text-xl">Choose a new password</h1>
        {done ? (
          <>
            <Notice tone="success" role="status" className="mt-5">
              Your password has been changed. You can now sign in with your new password.
            </Notice>
            <p className="mt-5 text-center text-[13px]">
              <Link to="/login" className="link">
                Back to sign in
              </Link>
            </p>
          </>
        ) : !token ? (
          <>
            <Notice tone="error" role="alert" className="mt-5">
              This reset link is incomplete — it has no token. Request a new reset link from the sign-in page.
            </Notice>
            <p className="mt-5 text-center text-[13px]">
              <Link to="/forgot-password" className="link">
                Request a new reset link
              </Link>
            </p>
          </>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-5 space-y-4">
            {error && (
              <Notice tone="error" role="alert">
                {error}
              </Notice>
            )}
            <p className="text-[13px] text-ink-muted">Your new password must be at least 8 characters long.</p>
            <TextField id="password" type="password" label="New password" autoComplete="new-password" required error={errors.password?.message} {...register('password')} />
            <TextField id="confirm" type="password" label="Repeat new password" autoComplete="new-password" required error={errors.confirm?.message} {...register('confirm')} />
            <Button type="submit" loading={isSubmitting} className="w-full">
              Change password
            </Button>
            <p className="text-center text-[13px]">
              <Link to="/login" className="link">
                Back to sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
