// The "Download on the App Store" badge and its trademark credit line, shown
// on the website's start screens: the iPhone and iPad app is the same game,
// and the site is where most players first meet it. Hidden inside the app
// itself and on Android (showsAppStoreBadge). The artwork is Apple's own,
// one file per language (public/badges/, from Apple's marketing toolbox),
// used unmodified as its marketing guidelines require; "App Store" is never
// translated, only the "Download on the" part is, by Apple.

import { useLanguage } from '../../i18n/LanguageContext';
import { assetUrl } from '../../assetUrl';
import { APP_STORE_URL, showsAppStoreBadge } from '../../platform/links';
import styles from './AppStoreBadge.module.css';

export function AppStoreBadge() {
  const { language, t } = useLanguage();
  if (!showsAppStoreBadge()) return null;
  return (
    <div className={styles.wrap}>
      <a className={styles.link} href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
        <img
          className={styles.badge}
          src={assetUrl(`/badges/app-store-badge-${language === 'it' ? 'it' : 'en'}.svg`)}
          alt={t.start.appStoreBadgeAlt}
          width={120}
          height={40}
        />
      </a>
    </div>
  );
}

/** Apple's credit line, once per page that shows the badge. */
export function AppStoreCredit() {
  const { t } = useLanguage();
  if (!showsAppStoreBadge()) return null;
  return <span className={styles.credit}>{t.start.appStoreCredit}</span>;
}
