'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TrustTowerIcon } from '@/components/brand/trust-tower-icon';
import { useAuth } from '@/lib/auth';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const { login, authDisabled } = useAuth();
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (authDisabled) {
      router.replace('/');
    }
  }, [authDisabled, router]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: 'admin@trusttower.dev',
      password: 'Passw0rd!'
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md bg-white/80 backdrop-blur-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <TrustTowerIcon decorative className="h-5 w-5 text-primary" />
            Trust Tower Login
          </CardTitle>
          <CardDescription>
            Demo credentials prefilled. Role-based access with JWT and audit logging.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit(async (values) => {
              try {
                setError('');
                await login(values.email, values.password);
                router.push('/');
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Login failed');
              }
            })}
          >
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" {...form.register('email')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" {...form.register('password')} />
            </div>
            {error ? <p className="text-sm text-rose-700">{error}</p> : null}
            <Button className="w-full" type="submit">
              Sign in
            </Button>
            <p className="text-xs text-muted-foreground">
              Also available: clinicalops@trusttower.dev, quality@trusttower.dev, analyst@trusttower.dev, viewer@trusttower.dev
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
