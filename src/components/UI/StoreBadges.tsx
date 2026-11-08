// The store badges on the website's start screens: Apple's "Download on the
// App Store" and Google's "Get it on Google Play". The iPhone and iPad app and
// the Android app (this site in a Trusted Web Activity) are the same game, and
// the site is where most players first meet them. Each badge is hidden where
// it leads nowhere useful (showsAppStoreBadge / showsGooglePlayBadge), and
// both inside the packaged app. The artwork is the stores' own, one file per
// language (public/badges/, from Apple's marketing toolbox and Google's badge
// generator), used unmodified as their guidelines require; "App Store" and
// "Google Play" are never translated, only the words around them are, by the
// stores themselves.

import { useLanguage } from '../../i18n/LanguageContext';
import { assetUrl } from '../../assetUrl';
import { APP_STORE_URL, GOOGLE_PLAY_URL, showsAppStoreBadge, showsGooglePlayBadge } from '../../platform/links';
import styles from './StoreBadges.module.css';

export function StoreBadges() {
  const { language, t } = useLanguage();
  const lang = language === 'it' ? 'it' : 'en';
  const appStore = showsAppStoreBadge();
  const googlePlay = showsGooglePlayBadge();
  if (!appStore && !googlePlay) return null;
  return (
    <div className={styles.wrap}>
      {appStore && (
        <a className={styles.link} href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
          <img
            className={styles.appStore}
            src={assetUrl(`/badges/app-store-badge-${lang}.svg`)}
            alt={t.start.appStoreBadgeAlt}
            width={120}
            height={40}
          />
        </a>
      )}
      {googlePlay && (
        <a className={styles.link} href={GOOGLE_PLAY_URL} target="_blank" rel="noopener noreferrer">
          <img
            className={styles.googlePlay}
            src={assetUrl(`/badges/google-play-badge-${lang}.png`)}
            alt={t.start.googlePlayBadgeAlt}
            width={646}
            height={250}
          />
        </a>
      )}
    </div>
  );
}

/** The stores' trademark credit lines, once per page that shows a badge. */
export function StoreCredits() {
  const { t } = useLanguage();
  const appStore = showsAppStoreBadge();
  const googlePlay = showsGooglePlayBadge();
  if (!appStore && !googlePlay) return null;
  return (
    <>
      {appStore && <span className={styles.credit}>{t.start.appStoreCredit}</span>}
      {googlePlay && <span className={styles.credit}>{t.start.googlePlayCredit}</span>}
    </>
  );
}
