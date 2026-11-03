import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/Form';
import { usePageMeta } from '@/hooks/misc';
import { errorMessage } from '@/services/api';
import { authService } from '@/services/settingsService';

const schema = z.object({ email: z.string().trim().min(1, 'Email is required.').email('Enter a valid email address.') });
type Values = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  usePageMeta('Reset password');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '' } });

  const onSubmit = async ({ email }: Values) => {
    setError(null);
    try {
      await authService.requestReset(email);
      setSentTo(email);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <div className="w-full max-w-md">
      <p className="mb-6 text-center font-brand text-3xl font-semibold">Your Store</p>
      <div className="card p-6 sm:p-7">
        <h1 className="text-xl">Reset your admin password</h1>
        <p className="mt-1 text-[13px] text-ink-muted">Enter the owner email address. In the live system a reset link would be emailed.</p>
        {sentTo ? (
          <Notice tone="success" role="status" className="mt-5">
            If <strong>{sentTo}</strong> belongs to an admin, reset instructions would be sent. <strong>Demo:</strong> no email was sent and no password changed.
          </Notice>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-5 space-y-4">
            {error && (
              <Notice tone="error" role="alert">
                {error}
              </Notice>
            )}
            <TextField id="email" type="email" label="Email" autoComplete="username" required error={errors.email?.message} {...register('email')} />
            <Button type="submit" loading={isSubmitting} className="w-full">
              Send reset instructions
            </Button>
          </form>
        )}
        <p className="mt-5 text-center text-[13px]">
          <Link to="/login" className="link">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
