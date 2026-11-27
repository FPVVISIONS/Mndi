import type { AuthState } from '@marquee/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, m } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { Segmented } from '../../components/ui/Segmented';
import { Spinner } from '../../components/ui/Spinner';
import { fadeUp, staggerChildren, stagger, t as tokens } from '../../design/motion';
import { api } from '../../lib/api';
import { useStatus } from '../../queries/hooks';

function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <input
        {...props}
        className="mt-2 h-12 w-full rounded-md border border-line bg-surface-1 px-4 text-lead outline-none transition-colors focus:border-fg-dim"
      />
    </label>
  );
}

function ErrorLine({ auth }: { auth: AuthState }) {
  const { t } = useTranslation();
  return (
    <AnimatePresence>
      {auth.error && (
        <m.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          role="alert"
          className="mt-3 text-small text-accent"
        >
          {t(`auth.${auth.error}`, { seconds: auth.waitSeconds })}
          {auth.detail && (
            <span className="mt-1 block text-caption text-fg-faint" dir="ltr">
              {auth.detail}
            </span>
          )}
        </m.p>
      )}
    </AnimatePresence>
  );
}

/** Shown while a step waits for Telegram, so a slow network never looks like a frozen button. */
function Waiting({ active }: { active: boolean }) {
  const { t } = useTranslation();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (!active) return;
    const id = window.setTimeout(() => setSlow(true), 10_000);
    return () => window.clearTimeout(id);
  }, [active]);
  return (
    <AnimatePresence>
      {active && (
        <m.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          role="status"
          className="flex items-center gap-2.5 text-small text-fg-dim"
        >
          <Spinner />
          {slow ? t('onboarding.connectingSlow') : t('onboarding.connecting')}
        </m.p>
      )}
    </AnimatePresence>
  );
}

/** One screen per login step. The server drives which step is current. */
export function ConnectStep({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: status } = useStatus();
  const { data: auth } = useQuery({
    queryKey: ['auth'],
    queryFn: api.auth,
    refetchInterval: (q) =>
      q.state.data?.step === 'qr' || q.state.data?.step === 'password' ? 1500 : false,
  });
  const [tab, setTab] = useState<'phone' | 'qr'>('phone');
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [manual, setManual] = useState(false);
  const [keysCode, setKeysCode] = useState('');

  const put = (a: AuthState) => qc.setQueryData(['auth'], a);
  const creds = useMutation({
    mutationFn: () => api.saveCredentials(Number(apiId), apiHash),
    onSuccess: put,
  });
  const keysPhone = useMutation({ mutationFn: () => api.keysPhone(phone), onSuccess: put });
  const keysSubmit = useMutation({
    mutationFn: () => api.keysCode(keysCode),
    onSuccess: (a) => {
      put(a);
      if (a.step === 'code') setCode('');
    },
  });
  const sendPhone = useMutation({ mutationFn: () => api.sendPhone(phone), onSuccess: put });
  const sendCode = useMutation({ mutationFn: (c: string) => api.sendCode(c), onSuccess: put });
  const sendPassword = useMutation({
    mutationFn: () => api.sendPassword(password),
    onSuccess: put,
  });
  const startQr = useMutation({ mutationFn: api.startQr, onSuccess: put });
  const cancel = useMutation({ mutationFn: api.cancelAuth, onSuccess: put });
  const resend = useMutation({ mutationFn: api.resendCode, onSuccess: put });
  // Sign in through the Telegram app on this phone: no code needed, the app approves the login.
  const [openApp, setOpenApp] = useState(false);
  const signInWithApp = async () => {
    setOpenApp(true);
    if (auth && auth.step !== 'phone' && auth.step !== 'qr') put(await api.cancelAuth());
    setTab('qr');
  };
  useEffect(() => {
    const url = auth?.qr?.url;
    if (!openApp || !url) return;
    setOpenApp(false);
    window.location.href = url;
  }, [openApp, auth?.qr?.url]);

  useEffect(() => {
    if (status?.telegram.state === 'ready') onDone();
  }, [status?.telegram.state, onDone]);

  useEffect(() => {
    if (tab === 'qr' && auth?.step === 'phone' && !startQr.isPending) startQr.mutate();
    if (tab === 'phone' && auth?.step === 'qr') cancel.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  if (!auth)
    return (
      <div className="grid place-items-center py-20">
        <Spinner />
      </div>
    );
  const step = auth.step === 'done' ? 'phone' : auth.step;

  return (
    <m.div
      key={step === 'qr' ? 'phone-tab' : step}
      variants={staggerChildren(stagger.list)}
      initial="hidden"
      animate="show"
      transition={tokens.base}
    >
      {step === 'credentials' && !manual && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            keysPhone.mutate();
          }}
          className="space-y-5"
        >
          <m.h2 variants={fadeUp} className="font-display text-title-l">
            {t('onboarding.phoneTitle')}
          </m.h2>
          <m.p variants={fadeUp} className="text-fg-dim">
            {t('onboarding.autoBody')}
          </m.p>
          <m.div variants={fadeUp}>
            <Field
              label={t('onboarding.phoneLabel')}
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              placeholder="+1 555 010 0199"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoFocus
            />
          </m.div>
          <ErrorLine auth={auth} />
          <Waiting active={keysPhone.isPending} />
          <m.div variants={fadeUp} className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={phone.replace(/\D/g, '').length < 7 || keysPhone.isPending}
            >
              {keysPhone.isPending ? <Spinner /> : t('onboarding.sendCode')}
            </Button>
            <button
              type="button"
              className="text-small text-fg-dim underline underline-offset-4 hover:text-fg"
              onClick={() => setManual(true)}
            >
              {t('onboarding.manualKeys')}
            </button>
          </m.div>
        </form>
      )}

      {step === 'keys-code' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            keysSubmit.mutate();
          }}
          className="space-y-5"
        >
          <m.h2 variants={fadeUp} className="font-display text-title-l">
            {t('onboarding.keysCodeTitle')}
          </m.h2>
          <m.p variants={fadeUp} className="text-fg-dim">
            {auth.retry ? t('onboarding.keysRetryBody') : t('onboarding.keysCodeBody')}
          </m.p>
          {!auth.retry && (
            <m.div variants={fadeUp}>
              <Field
                label={t('onboarding.keysCodeLabel')}
                autoComplete="one-time-code"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                autoFocus
                value={keysCode}
                onChange={(e) => setKeysCode(e.target.value.trim())}
              />
            </m.div>
          )}
          <ErrorLine auth={auth} />
          <Waiting active={keysSubmit.isPending} />
          <m.div variants={fadeUp} className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={(!auth.retry && keysCode.length < 4) || keysSubmit.isPending}
            >
              {keysSubmit.isPending ? (
                <Spinner />
              ) : auth.retry ? (
                t('common.retry')
              ) : (
                t('common.continue')
              )}
            </Button>
            <Button
              variant="ghost"
              icon={<ArrowLeft size={16} className="flip-rtl" />}
              onClick={() => {
                setKeysCode('');
                cancel.mutate();
              }}
            >
              {t('onboarding.differentNumber')}
            </Button>
          </m.div>
          {auth.retry && (
            <m.p variants={fadeUp} className="text-small text-fg-dim">
              {t('onboarding.keysByHand')}{' '}
              <a
                href="https://my.telegram.org/apps"
                className="text-fg underline underline-offset-4"
              >
                my.telegram.org/apps
              </a>
            </m.p>
          )}
        </form>
      )}

      {step === 'credentials' && manual && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            creds.mutate();
          }}
          className="space-y-5"
        >
          <m.h2 variants={fadeUp} className="font-display text-title-l">
            {t('onboarding.credTitle')}
          </m.h2>
          <m.p variants={fadeUp} className="text-fg-dim">
            {t('onboarding.credBody')}
          </m.p>
          <m.div variants={fadeUp}>
            <Field
              label={t('onboarding.apiId')}
              inputMode="numeric"
              value={apiId}
              onChange={(e) => setApiId(e.target.value.replace(/\D/g, ''))}
            />
          </m.div>
          <m.div variants={fadeUp}>
            <Field
              label={t('onboarding.apiHash')}
              value={apiHash}
              onChange={(e) => setApiHash(e.target.value.trim())}
              autoComplete="off"
              spellCheck={false}
            />
          </m.div>
          <ErrorLine auth={auth} />
          <m.div variants={fadeUp}>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={!apiId || apiHash.length < 32 || creds.isPending}
            >
              {t('onboarding.credSave')}
            </Button>
          </m.div>
          <m.div variants={fadeUp}>
            <button
              type="button"
              className="text-small text-fg-dim underline underline-offset-4 hover:text-fg"
              onClick={() => setManual(false)}
            >
              {t('onboarding.useAuto')}
            </button>
          </m.div>
        </form>
      )}

      {(step === 'phone' || step === 'qr') && (
        <div className="space-y-6">
          <m.h2 variants={fadeUp} className="font-display text-title-l">
            {t('onboarding.phoneTitle')}
          </m.h2>
          <m.div variants={fadeUp}>
            <Segmented
              label={t('onboarding.phoneTitle')}
              value={tab}
              onChange={setTab}
              options={[
                { value: 'phone', label: t('onboarding.tabPhone') },
                { value: 'qr', label: t('onboarding.tabQr') },
              ]}
            />
          </m.div>
          {tab === 'phone' ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendPhone.mutate();
              }}
              className="space-y-5"
            >
              <m.p variants={fadeUp} className="text-fg-dim">
                {t('onboarding.phoneBody')}
              </m.p>
              <m.div variants={fadeUp}>
                <Field
                  label={t('onboarding.phoneLabel')}
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="+1 555 010 0199"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoFocus
                />
              </m.div>
              <ErrorLine auth={auth} />
              <Waiting active={sendPhone.isPending} />
              {status?.mock && (
                <m.p
                  variants={fadeUp}
                  className="rounded-md border border-line bg-surface-1 p-3 text-small text-fg-dim"
                >
                  {t('onboarding.demoNote')}
                </m.p>
              )}
              <m.div variants={fadeUp}>
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  disabled={phone.replace(/\D/g, '').length < 7 || sendPhone.isPending}
                >
                  {t('onboarding.sendCode')}
                </Button>
              </m.div>
              <m.div variants={fadeUp}>
                <button
                  type="button"
                  onClick={() => void signInWithApp()}
                  className="text-small text-fg-dim underline underline-offset-4 hover:text-fg"
                >
                  {t('onboarding.useApp')}
                </button>
              </m.div>
              {auth.canChangeKeys && (
                <m.div variants={fadeUp}>
                  <button
                    type="button"
                    onClick={() => {
                      setManual(true);
                      void api.resetKeys().then(put);
                    }}
                    className="text-small text-fg-faint underline underline-offset-4 hover:text-fg"
                  >
                    {t('onboarding.changeKeys')}
                  </button>
                </m.div>
              )}
            </form>
          ) : (
            <div>
              <p className="mb-5 text-fg-dim">{t('onboarding.qrBody')}</p>
              <div className="grid size-56 place-items-center rounded-lg bg-white p-3">
                {auth.qr ? (
                  <div
                    className="size-full [&_svg]:size-full"
                    dangerouslySetInnerHTML={{ __html: auth.qr.svg }}
                    aria-label="QR"
                  />
                ) : (
                  <Spinner />
                )}
              </div>
              {auth.qr?.url && (
                <Button
                  variant="secondary"
                  className="mt-5"
                  onClick={() => {
                    window.location.href = auth.qr!.url!;
                  }}
                >
                  {t('onboarding.openTelegram')}
                </Button>
              )}
              <p className="mt-3 max-w-sm text-small text-fg-faint">
                {t('onboarding.openTelegramHint')}
              </p>
              <ErrorLine auth={auth} />
            </div>
          )}
        </div>
      )}

      {step === 'code' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendCode.mutate(code);
          }}
          className="space-y-5"
        >
          <m.h2 variants={fadeUp} className="font-display text-title-l">
            {t('onboarding.codeTitle')}
          </m.h2>
          <m.p variants={fadeUp} className="text-fg-dim">
            {auth.codeVia === 'sms'
              ? t('onboarding.codeViaSms')
              : auth.codeVia === 'call'
                ? t('onboarding.codeViaCall')
                : auth.codeVia === 'email'
                  ? t('onboarding.codeViaEmail')
                  : t('onboarding.codeViaApp')}
          </m.p>
          <m.div variants={fadeUp}>
            <Field
              label={t('onboarding.codeLabel')}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={6}
              value={code}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '');
                setCode(v);
                if (v.length === 5) sendCode.mutate(v);
              }}
              style={{ letterSpacing: '0.5em', fontVariantNumeric: 'tabular-nums' }}
            />
          </m.div>
          <ErrorLine auth={auth} />
          <m.div variants={fadeUp} className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={code.length < 5 || sendCode.isPending}
            >
              {t('onboarding.verify')}
            </Button>
            <Button
              variant="ghost"
              icon={<ArrowLeft size={16} className="flip-rtl" />}
              onClick={() => {
                setCode('');
                cancel.mutate();
              }}
            >
              {t('onboarding.differentNumber')}
            </Button>
          </m.div>
          <m.div variants={fadeUp} className="space-y-2 border-t border-white/10 pt-5">
            <p className="text-small text-fg-dim">{t('onboarding.noCode')}</p>
            <div className="flex flex-wrap gap-3">
              {auth.canResend && (
                <Button size="sm" onClick={() => resend.mutate()} disabled={resend.isPending}>
                  {resend.isPending ? <Spinner /> : t('onboarding.resendSms')}
                </Button>
              )}
              <Button size="sm" onClick={() => void signInWithApp()}>
                {t('onboarding.useApp')}
              </Button>
            </div>
          </m.div>
        </form>
      )}

      {step === 'password' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendPassword.mutate();
          }}
          className="space-y-5"
        >
          <m.h2 variants={fadeUp} className="font-display text-title-l">
            {t('onboarding.passwordTitle')}
          </m.h2>
          <m.p variants={fadeUp} className="text-fg-dim">
            {t('onboarding.passwordBody')}
            {auth.hint ? ` ${t('onboarding.hint', { hint: auth.hint })}` : ''}
          </m.p>
          <m.div variants={fadeUp}>
            <Field
              label={t('onboarding.passwordLabel')}
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </m.div>
          <ErrorLine auth={auth} />
          <m.div variants={fadeUp}>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={!password || sendPassword.isPending}
            >
              {t('onboarding.unlock')}
            </Button>
          </m.div>
        </form>
      )}
    </m.div>
  );
}
