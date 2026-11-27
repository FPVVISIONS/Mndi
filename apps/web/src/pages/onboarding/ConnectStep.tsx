import type { AuthState } from '@marquee/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { Segmented } from '../../components/ui/Segmented';
import { Spinner } from '../../components/ui/Spinner';
import { fadeUp, staggerChildren, stagger, t as tokens } from '../../design/motion';
import { api } from '../../lib/api';
import { useStatus } from '../../queries/hooks';

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <input {...props} className="mt-2 h-12 w-full rounded-md border border-line bg-surface-1 px-4 text-lead outline-none transition-colors focus:border-fg-dim" />
    </label>
  );
}

function ErrorLine({ auth }: { auth: AuthState }) {
  const { t } = useTranslation();
  return (
    <AnimatePresence>
      {auth.error && (
        <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="alert" className="mt-3 text-small text-accent">
          {t(`auth.${auth.error}`, { seconds: auth.waitSeconds })}
        </motion.p>
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
    refetchInterval: (q) => (q.state.data?.step === 'qr' || q.state.data?.step === 'password' ? 1500 : false),
  });
  const [tab, setTab] = useState<'phone' | 'qr'>('phone');
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');

  const put = (a: AuthState) => qc.setQueryData(['auth'], a);
  const creds = useMutation({ mutationFn: () => api.saveCredentials(Number(apiId), apiHash), onSuccess: put });
  const sendPhone = useMutation({ mutationFn: () => api.sendPhone(phone), onSuccess: put });
  const sendCode = useMutation({ mutationFn: (c: string) => api.sendCode(c), onSuccess: put });
  const sendPassword = useMutation({ mutationFn: () => api.sendPassword(password), onSuccess: put });
  const startQr = useMutation({ mutationFn: api.startQr, onSuccess: put });
  const cancel = useMutation({ mutationFn: api.cancelAuth, onSuccess: put });

  useEffect(() => {
    if (status?.telegram.state === 'ready') onDone();
  }, [status?.telegram.state, onDone]);

  useEffect(() => {
    if (tab === 'qr' && auth?.step === 'phone' && !startQr.isPending) startQr.mutate();
    if (tab === 'phone' && auth?.step === 'qr') cancel.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  if (!auth) return <div className="grid place-items-center py-20"><Spinner /></div>;
  const step = auth.step === 'done' ? 'phone' : auth.step;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={step === 'qr' ? 'phone-tab' : step}
        variants={staggerChildren(stagger.list)}
        initial="hidden"
        animate="show"
        exit={{ opacity: 0, transition: { duration: 0.1 } }}
        transition={tokens.base}
      >
        {step === 'credentials' && (
          <form onSubmit={(e) => { e.preventDefault(); creds.mutate(); }} className="space-y-5">
            <motion.h2 variants={fadeUp} className="font-display text-title-l">{t('onboarding.credTitle')}</motion.h2>
            <motion.p variants={fadeUp} className="text-fg-dim">{t('onboarding.credBody')}</motion.p>
            <motion.div variants={fadeUp}><Field label={t('onboarding.apiId')} inputMode="numeric" value={apiId} onChange={(e) => setApiId(e.target.value.replace(/\D/g, ''))} /></motion.div>
            <motion.div variants={fadeUp}><Field label={t('onboarding.apiHash')} value={apiHash} onChange={(e) => setApiHash(e.target.value.trim())} autoComplete="off" spellCheck={false} /></motion.div>
            <ErrorLine auth={auth} />
            <motion.div variants={fadeUp}><Button type="submit" variant="primary" size="lg" disabled={!apiId || apiHash.length < 32 || creds.isPending}>{t('onboarding.credSave')}</Button></motion.div>
          </form>
        )}

        {(step === 'phone' || step === 'qr') && (
          <div className="space-y-6">
            <motion.h2 variants={fadeUp} className="font-display text-title-l">{t('onboarding.phoneTitle')}</motion.h2>
            <motion.div variants={fadeUp}>
              <Segmented label={t('onboarding.phoneTitle')} value={tab} onChange={setTab} options={[{ value: 'phone', label: t('onboarding.tabPhone') }, { value: 'qr', label: t('onboarding.tabQr') }]} />
            </motion.div>
            {tab === 'phone' ? (
              <form onSubmit={(e) => { e.preventDefault(); sendPhone.mutate(); }} className="space-y-5">
                <motion.p variants={fadeUp} className="text-fg-dim">{t('onboarding.phoneBody')}</motion.p>
                <motion.div variants={fadeUp}><Field label={t('onboarding.phoneLabel')} type="tel" autoComplete="tel" inputMode="tel" placeholder="+1 555 010 0199" value={phone} onChange={(e) => setPhone(e.target.value)} autoFocus /></motion.div>
                <ErrorLine auth={auth} />
                {status?.mock && <motion.p variants={fadeUp} className="rounded-md border border-line bg-surface-1 p-3 text-small text-fg-dim">{t('onboarding.demoNote')}</motion.p>}
                <motion.div variants={fadeUp}><Button type="submit" variant="primary" size="lg" disabled={phone.replace(/\D/g, '').length < 7 || sendPhone.isPending}>{t('onboarding.sendCode')}</Button></motion.div>
              </form>
            ) : (
              <div>
                <p className="mb-5 text-fg-dim">{t('onboarding.qrBody')}</p>
                <div className="grid size-56 place-items-center rounded-lg bg-white p-3">
                  {auth.qr ? <div className="size-full [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: auth.qr.svg }} aria-label="QR" /> : <Spinner />}
                </div>
                <ErrorLine auth={auth} />
              </div>
            )}
          </div>
        )}

        {step === 'code' && (
          <form onSubmit={(e) => { e.preventDefault(); sendCode.mutate(code); }} className="space-y-5">
            <motion.h2 variants={fadeUp} className="font-display text-title-l">{t('onboarding.codeTitle')}</motion.h2>
            <motion.p variants={fadeUp} className="text-fg-dim">{auth.codeViaApp ? t('onboarding.codeViaApp') : t('onboarding.codeViaSms')}</motion.p>
            <motion.div variants={fadeUp}>
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
            </motion.div>
            <ErrorLine auth={auth} />
            <motion.div variants={fadeUp} className="flex items-center gap-3">
              <Button type="submit" variant="primary" size="lg" disabled={code.length < 5 || sendCode.isPending}>{t('onboarding.verify')}</Button>
              <Button variant="ghost" icon={<ArrowLeft size={16} className="flip-rtl" />} onClick={() => { setCode(''); cancel.mutate(); }}>{t('onboarding.differentNumber')}</Button>
            </motion.div>
          </form>
        )}

        {step === 'password' && (
          <form onSubmit={(e) => { e.preventDefault(); sendPassword.mutate(); }} className="space-y-5">
            <motion.h2 variants={fadeUp} className="font-display text-title-l">{t('onboarding.passwordTitle')}</motion.h2>
            <motion.p variants={fadeUp} className="text-fg-dim">{t('onboarding.passwordBody')}{auth.hint ? ` ${t('onboarding.hint', { hint: auth.hint })}` : ''}</motion.p>
            <motion.div variants={fadeUp}><Field label={t('onboarding.passwordLabel')} type="password" autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} /></motion.div>
            <ErrorLine auth={auth} />
            <motion.div variants={fadeUp}><Button type="submit" variant="primary" size="lg" disabled={!password || sendPassword.isPending}>{t('onboarding.unlock')}</Button></motion.div>
          </form>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
