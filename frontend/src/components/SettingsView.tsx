import type { UserProfile } from '../api/auth';
import { IconLogout, IconSliders } from './icons';

interface Props {
  user: UserProfile | null;
  onLogout: () => void;
}

export default function SettingsView({ user, onLogout }: Props) {
  const displayName = user?.displayName ?? '';
  const initial = displayName.trim().charAt(0).toUpperCase() || '؟';

  return (
    <div className="view">
      <header className="view-header">
        <h1>الإعدادات</h1>
        <p>بيانات حسابك وتفضيلاتك داخل المنصة.</p>
      </header>

      <section className="settings-card">
        <h2 className="settings-card-title">
          <IconSliders width={18} height={18} />
          الحساب
        </h2>
        <div className="settings-account">
          <span className="avatar large">{initial}</span>
          <div className="settings-account-meta">
            <strong>{user?.displayName ?? 'مستخدم غير معروف'}</strong>
            <span dir="ltr">{user?.email ?? ''}</span>
          </div>
        </div>
        <dl className="settings-list">
          <div>
            <dt>اسم المستخدم</dt>
            <dd>{user?.displayName ?? '—'}</dd>
          </div>
          <div>
            <dt>البريد الإلكتروني</dt>
            <dd dir="ltr">{user?.email ?? '—'}</dd>
          </div>
          <div>
            <dt>الدور</dt>
            <dd>{user !== null && user.roles.length > 0 ? user.roles.join('، ') : 'مسوّق'}</dd>
          </div>
          <div>
            <dt>تاريخ إنشاء الحساب</dt>
            <dd>{user?.createdAt ? new Date(user.createdAt).toLocaleDateString('ar-EG') : '—'}</dd>
          </div>
          <div>
            <dt>آخر تسجيل دخول</dt>
            <dd>{user?.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('ar-EG') : '—'}</dd>
          </div>
        </dl>
      </section>

      <section className="settings-card">
        <h2 className="settings-card-title">الخطة</h2>
        <p className="settings-note">
          أنت على خطة النسخة التجريبية الأساسية (MVP) — تتضمن البحث في الأنشطة التجارية وحفظ ومتابعة العملاء المحتملين.
        </p>
      </section>

      <section className="settings-card">
        <h2 className="settings-card-title">الجلسة</h2>
        <button type="button" className="danger" onClick={onLogout}>
          <IconLogout width={16} height={16} />
          تسجيل الخروج
        </button>
      </section>
    </div>
  );
}
