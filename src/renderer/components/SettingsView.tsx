import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Alert, Avatar, Button, Card, Form, Input, Select, Spin, Typography, message } from 'antd';
import { SettingOutlined, UploadOutlined } from '@ant-design/icons';
import { trpc } from '../lib/trpc';
import { useStore } from '../hooks/useStore';
import { twitarrImageThumbUrl, twitarrUserIdenticonUrl } from '../lib/twitarrImage';
import { arrayBufferToBase64, TWITARR_IMAGE_UPLOAD_MAX_BYTES } from '../lib/imageBase64';
import { profileResponseToFormDefaults, type ProfileFormDefaults } from '../lib/twitarrProfile';

const { Text, Paragraph } = Typography;

type DinnerTeam = 'red' | 'gold' | 'sro';

const AVATAR_MAX_BYTES = TWITARR_IMAGE_UPLOAD_MAX_BYTES;
const AVATAR_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';

/** Optional string fields: empty OK; if set, match Twitarr `UserProfileUploadData` validations. */
function optionalLen(min: number, max: number, label: string) {
  return {
    validator(_: unknown, value: string | undefined) {
      const v = (value ?? '').trim();
      if (v.length === 0) return Promise.resolve();
      if (v.length < min || v.length > max) {
        return Promise.reject(new Error(`${label} must be ${min}–${max} characters (or leave blank).`));
      }
      return Promise.resolve();
    },
  };
}

export function SettingsView() {
  const baseUrl = useStore((s) => s.server.baseUrl ?? '');
  const storeUsername = useStore((s) => s.auth.username);
  const [profileForm] = Form.useForm();
  const [passwordForm] = Form.useForm();
  const [usernameForm] = Form.useForm();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);

  const profileQuery = trpc.userProfileGet.useQuery();
  const utils = trpc.useUtils();

  const profileMutation = trpc.userProfileUpdate.useMutation({
    onSuccess: async () => {
      message.success('Profile saved');
      await utils.userProfileGet.invalidate();
    },
    onError: (e) => message.error(e.message),
  });

  const passwordMutation = trpc.userPasswordChange.useMutation({
    onSuccess: () => {
      message.success('Password updated');
      passwordForm.resetFields();
    },
    onError: (e) => message.error(e.message),
  });

  const usernameMutation = trpc.userUsernameChange.useMutation({
    onSuccess: () => {
      message.success('Username updated');
      usernameForm.resetFields();
    },
    onError: (e) => message.error(e.message),
  });

  const imageUploadMutation = trpc.userImageUpload.useMutation({
    onSuccess: async () => {
      message.success('Profile photo updated');
      await utils.userProfileGet.invalidate();
    },
    onError: (e) => message.error(e.message),
    onSettled: () => setAvatarBusy(false),
  });

  const imageRemoveMutation = trpc.userImageRemove.useMutation({
    onSuccess: async () => {
      message.success('Profile photo removed');
      await utils.userProfileGet.invalidate();
    },
    onError: (e) => message.error(e.message),
    onSettled: () => setAvatarBusy(false),
  });

  const defaults: ProfileFormDefaults = useMemo(
    () => profileResponseToFormDefaults(profileQuery.data),
    [profileQuery.data],
  );

  /** Push server values into the form after paint (Ant Design Form can miss early `setFieldsValue`). */
  useLayoutEffect(() => {
    if (!profileQuery.isSuccess || profileQuery.data === undefined) return;
    const d = profileResponseToFormDefaults(profileQuery.data);
    const tick = requestAnimationFrame(() => {
      profileForm.setFieldsValue({
        displayName: d.displayName,
        preferredPronoun: d.preferredPronoun,
        realName: d.realName,
        homeLocation: d.homeLocation,
        roomNumber: d.roomNumber,
        email: d.email,
        message: d.message,
        about: d.about,
        discordUsername: d.discordUsername,
        dinnerTeam: d.dinnerTeam ?? undefined,
      });
    });
    return () => cancelAnimationFrame(tick);
  }, [profileQuery.isSuccess, profileQuery.data, profileQuery.dataUpdatedAt, profileForm]);

  const avatarSrc = useMemo(() => {
    if (!baseUrl) return undefined;
    if (defaults.userImage) return twitarrImageThumbUrl(baseUrl, defaults.userImage);
    if (defaults.userId) return twitarrUserIdenticonUrl(baseUrl, defaults.userId);
    return undefined;
  }, [baseUrl, defaults.userImage, defaults.userId]);

  const initial = (defaults.headerUsername || storeUsername || '?').charAt(0).toUpperCase();

  const onSaveProfile = () => {
    profileForm
      .validateFields()
      .then((values: {
        displayName: string;
        preferredPronoun: string;
        realName: string;
        homeLocation: string;
        roomNumber: string;
        email: string;
        message: string;
        about: string;
        discordUsername: string;
        dinnerTeam: DinnerTeam | null | undefined;
      }) => {
        profileMutation.mutate({
          displayName: values.displayName ?? '',
          realName: values.realName ?? '',
          preferredPronoun: values.preferredPronoun ?? '',
          homeLocation: values.homeLocation ?? '',
          roomNumber: values.roomNumber ?? '',
          email: values.email ?? '',
          message: values.message ?? '',
          about: values.about ?? '',
          discordUsername: values.discordUsername ?? '',
          dinnerTeam: values.dinnerTeam ?? null,
        });
      })
      .catch(() => {});
  };

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        padding: 16,
        background: '#1B1D23',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <SettingOutlined style={{ fontSize: 20, color: '#6F458F' }} />
          <Text strong style={{ fontSize: 16, color: '#EFECE2' }}>
            Settings
          </Text>
        </div>

        <Paragraph type="secondary" style={{ marginBottom: 0, color: '#9A9D9A', fontSize: 13 }}>
          Saving your profile replaces all of these fields on the server; leave a field blank to clear it. Username
          can only be changed about once per 20 hours.
        </Paragraph>

        {profileQuery.isLoading ? (
          <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}>
            <Spin />
          </div>
        ) : profileQuery.isError ? (
          <Alert type="error" message="Could not load profile" description={profileQuery.error.message} showIcon />
        ) : (
          <Card
            title="Profile"
            size="small"
            styles={{ header: { color: '#EFECE2', borderBottomColor: '#3d4149' } }}
            style={{ background: '#24272e', borderColor: '#3d4149' }}
          >
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
              <Avatar
                size={64}
                src={avatarSrc}
                style={{ background: '#365563', color: '#EFECE2', borderRadius: 10, flexShrink: 0 }}
              >
                {initial}
              </Avatar>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 600, color: '#EFECE2' }}>@{defaults.headerUsername || storeUsername}</div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={AVATAR_ACCEPT}
                  style={{ display: 'none' }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    if (!file.type.startsWith('image/')) {
                      message.error('Choose an image file (JPEG, PNG, WebP, or GIF).');
                      return;
                    }
                    if (file.size > AVATAR_MAX_BYTES) {
                      message.error(`Image must be at most ${AVATAR_MAX_BYTES / (1024 * 1024)} MB.`);
                      return;
                    }
                    setAvatarBusy(true);
                    try {
                      const b64 = arrayBufferToBase64(await file.arrayBuffer());
                      imageUploadMutation.mutate({ imageBase64: b64 });
                    } catch {
                      setAvatarBusy(false);
                      message.error('Could not read that file.');
                    }
                  }}
                />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                  <Button
                    type="default"
                    icon={<UploadOutlined />}
                    loading={avatarBusy && imageUploadMutation.isPending}
                    disabled={avatarBusy}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Replace photo
                  </Button>
                  {defaults.userImage ? (
                    <Button
                      danger
                      type="default"
                      loading={avatarBusy && imageRemoveMutation.isPending}
                      disabled={avatarBusy}
                      onClick={() => {
                        setAvatarBusy(true);
                        imageRemoveMutation.mutate();
                      }}
                    >
                      Remove photo
                    </Button>
                  ) : null}
                </div>
                <Text type="secondary" style={{ fontSize: 11, color: '#7A7490', display: 'block', marginTop: 6 }}>
                  JPEG, PNG, WebP, or GIF — up to {AVATAR_MAX_BYTES / (1024 * 1024)} MB. The server may resize or reject very
                  large images.
                </Text>
              </div>
            </div>

            <Form form={profileForm} layout="vertical" requiredMark={false} style={{ color: '#EFECE2' }}>
              <Form.Item
                name="displayName"
                label="Display name"
                rules={[optionalLen(2, 50, 'Display name')]}
                style={{ marginBottom: 12 }}
              >
                <Input placeholder="Shown across the app" />
              </Form.Item>
              <Form.Item
                name="preferredPronoun"
                label="Preferred pronouns"
                rules={[optionalLen(2, 50, 'Pronouns')]}
                style={{ marginBottom: 12 }}
              >
                <Input placeholder="e.g. they/them" />
              </Form.Item>
              <Form.Item name="realName" label="Real name" rules={[optionalLen(2, 50, 'Real name')]} style={{ marginBottom: 12 }}>
                <Input />
              </Form.Item>
              <Form.Item
                name="homeLocation"
                label="Home location"
                rules={[optionalLen(2, 50, 'Home location')]}
                style={{ marginBottom: 12 }}
              >
                <Input placeholder="City / region" />
              </Form.Item>
              <Form.Item
                name="roomNumber"
                label="Cabin number"
                rules={[optionalLen(4, 20, 'Cabin number')]}
                style={{ marginBottom: 12 }}
              >
                <Input placeholder="If on ship" />
              </Form.Item>
              <Form.Item name="email" label="Email" rules={[optionalLen(4, 50, 'Email')]} style={{ marginBottom: 12 }}>
                <Input type="email" autoComplete="email" />
              </Form.Item>
              <Form.Item name="message" label="Profile greeting" rules={[optionalLen(4, 80, 'Greeting')]} style={{ marginBottom: 12 }}>
                <Input.TextArea rows={2} placeholder="Short message for your profile visitors" showCount maxLength={80} />
              </Form.Item>
              <Form.Item name="about" label="About" rules={[optionalLen(4, 400, 'About')]} style={{ marginBottom: 12 }}>
                <Input.TextArea rows={4} placeholder="Longer bio" showCount maxLength={400} />
              </Form.Item>
              <Form.Item name="discordUsername" label="Discord username" style={{ marginBottom: 12 }}>
                <Input placeholder="Optional" />
              </Form.Item>
              <Form.Item name="dinnerTeam" label="Dinner team" style={{ marginBottom: 16 }}>
                <Select
                  allowClear
                  placeholder="None"
                  options={[
                    { value: 'red', label: 'Red Team' },
                    { value: 'gold', label: 'Gold Team' },
                    { value: 'sro', label: 'Club SRO' },
                  ]}
                />
              </Form.Item>
              <Button type="primary" onClick={onSaveProfile} loading={profileMutation.isPending}>
                Save profile
              </Button>
            </Form>
          </Card>
        )}

        <Card
          title="Username"
          size="small"
          styles={{ header: { color: '#EFECE2', borderBottomColor: '#3d4149' } }}
          style={{ background: '#24272e', borderColor: '#3d4149' }}
        >
          <Paragraph style={{ color: '#9A9D9A', fontSize: 13, marginTop: 0 }}>
            Current: <Text strong style={{ color: '#EFECE2' }}>@{storeUsername}</Text>
          </Paragraph>
          <Form form={usernameForm} layout="vertical" style={{ maxWidth: 360 }}>
            <Form.Item
              name="username"
              label="New username"
              rules={[{ required: true, message: 'Enter a username' }]}
            >
              <Input autoComplete="username" />
            </Form.Item>
            <Button
              onClick={() => {
                usernameForm
                  .validateFields()
                  .then((v: { username: string }) => usernameMutation.mutate({ username: v.username.trim() }))
                  .catch(() => {});
              }}
              loading={usernameMutation.isPending}
            >
              Change username
            </Button>
          </Form>
        </Card>

        <Card
          title="Password"
          size="small"
          styles={{ header: { color: '#EFECE2', borderBottomColor: '#3d4149' } }}
          style={{ background: '#24272e', borderColor: '#3d4149' }}
        >
          <Form form={passwordForm} layout="vertical" style={{ maxWidth: 360 }}>
            <Form.Item
              name="currentPassword"
              label="Current password"
              rules={[{ required: true, message: 'Required' }]}
            >
              <Input.Password autoComplete="current-password" />
            </Form.Item>
            <Form.Item
              name="newPassword"
              label="New password"
              rules={[
                { required: true, message: 'Required' },
                { min: 6, message: 'At least 6 characters' },
                { max: 50, message: 'At most 50 characters' },
              ]}
            >
              <Input.Password autoComplete="new-password" />
            </Form.Item>
            <Form.Item
              name="confirmPassword"
              label="Confirm new password"
              dependencies={['newPassword']}
              rules={[
                { required: true, message: 'Confirm your password' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                    return Promise.reject(new Error('Passwords do not match'));
                  },
                }),
              ]}
            >
              <Input.Password autoComplete="new-password" />
            </Form.Item>
            <Button
              type="primary"
              onClick={() => {
                passwordForm
                  .validateFields()
                  .then((v: { currentPassword: string; newPassword: string }) =>
                    passwordMutation.mutate({
                      currentPassword: v.currentPassword,
                      newPassword: v.newPassword,
                    }),
                  )
                  .catch(() => {});
              }}
              loading={passwordMutation.isPending}
            >
              Update password
            </Button>
          </Form>
        </Card>
      </div>
    </div>
  );
}
