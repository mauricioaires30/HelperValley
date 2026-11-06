import { useTranslation } from 'react-i18next';

export function HomePage() {
  const { t } = useTranslation();
  return (
    <section>
      <h2>{t('nav.home')}</h2>
    </section>
  );
}
