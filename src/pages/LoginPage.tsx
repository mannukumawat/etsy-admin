import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import logoMark from '@/assets/logo-mark.png';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/Form';
import { errorMessage } from '@/services/api';
import { authService } from '@/services/settingsService';
import { useAuth } from '@/store';
import { usePageMeta } from '@/hooks/misc';

const schema = z.object({
  email: z.string().trim().min(1, 'Email is required.').email('Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
});
type Values = z.infer<typeof schema>;

const safeNext = (v: string | null) => (v && v.startsWith('/') && !v.startsWith('//') ? v : '/dashboard');

export default function LoginPage() {
  usePageMeta('Sign in');
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  if (user) return <Navigate to={safeNext(params.get('next'))} replace />;

  const onSubmit = async (v: Values) => {
    setFormError(null);
    try {
      setUser(await authService.login(v.email, v.password));
      navigate(safeNext(params.get('next')), { replace: true });
    } catch (e) {
      setFormError(errorMessage(e));
    }
  };

  return (
    <div className="w-full max-w-md">
      <div className="mb-6 flex items-center justify-center gap-2.5">
        <img src={logoMark} alt="" className="h-9 w-9 object-contain" />
        <p className="font-brand text-3xl font-semibold">Your Store</p>
      </div>
      <div className="card p-6 sm:p-7">
        <h1 className="text-xl">Sign in to the admin</h1>
        <p className="mt-1 text-[13px] text-ink-muted">Manage products, orders, content and settings for the shop.</p>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-5 space-y-4">
          {formError && (
            <Notice tone="error" role="alert">
              {formError}
            </Notice>
          )}
          <TextField id="email" type="email" label="Email" autoComplete="username" required error={errors.email?.message} {...register('email')} />
          <TextField id="password" type="password" label="Password" autoComplete="current-password" required error={errors.password?.message} {...register('password')} />
          <div className="flex justify-end">
            <Link to="/forgot-password" className="link text-[13px]">
              Forgot password?
            </Link>
          </div>
          <Button type="submit" loading={isSubmitting} className="w-full">
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}
