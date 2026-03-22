import { useState } from 'react';
import { Form, Input, Button, Alert } from 'antd';
import { trpc } from '../lib/trpc';

export function LoginForm() {
  const [form] = Form.useForm();
  const [error, setError] = useState<string | null>(null);
  const loginMutation = trpc.login.useMutation({
    onSuccess: () => {
      console.log('[Cephalopod] LoginForm login success');
      setError(null);
    },
    onError: (err) => {
      console.error('[Cephalopod] LoginForm login error', { message: err.message, data: err.data });
      setError(err.message);
    },
  });

  const handleSubmit = (values: { baseUrl: string; username: string; password: string }) => {
    setError(null);
    const payload = {
      baseUrl: values.baseUrl.trim(),
      username: values.username.trim(),
      password: values.password,
    };
    console.log('[Cephalopod] LoginForm submit', { baseUrl: payload.baseUrl, username: payload.username });
    loginMutation.mutate(payload);
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleSubmit}
      initialValues={{ baseUrl: 'https://twitarr.com' }}
      style={{ width: '100%' }}
    >
      <Form.Item name="baseUrl" label="Server URL" rules={[{ required: true, type: 'url' }]}>
        <Input placeholder="https://twitarr.com" disabled={loginMutation.isPending} />
      </Form.Item>
      <Form.Item name="username" label="Username" rules={[{ required: true }]}>
        <Input autoComplete="username" disabled={loginMutation.isPending} />
      </Form.Item>
      <Form.Item name="password" label="Password" rules={[{ required: true }]}>
        <Input.Password autoComplete="current-password" disabled={loginMutation.isPending} />
      </Form.Item>
      {error && (
        <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />
      )}
      <Form.Item>
        <Button type="primary" htmlType="submit" loading={loginMutation.isPending} block>
          {loginMutation.isPending ? 'Logging in…' : 'Log in'}
        </Button>
      </Form.Item>
    </Form>
  );
}
