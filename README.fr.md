# Solveur Real-Debrid pour Motrix ⚡

<p align="center">
  <b>Débridez et téléchargez vos fichiers à la vitesse maximale de votre fibre dans l'interface moderne de Motrix.</b>
</p>

<p align="center">
  <a href="https://github.com/DonTarken/motrix-plugin-realdebrid/releases/latest"><img src="https://img.shields.io/github/v/release/DonTarken/motrix-plugin-realdebrid?label=Derni%C3%A8re%20Version&color=success&style=for-the-badge" alt="Dernière Version" /></a>
  <a href="https://motrix.app"><img src="https://img.shields.io/badge/Motrix-%3E%3D%202.0.0-orange?style=for-the-badge" alt="Motrix 2.0+" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/Licence-MIT-blue?style=for-the-badge" alt="Licence MIT" /></a>
  <a href="https://github.com/sponsors/DonTarken"><img src="https://img.shields.io/badge/Sponsor-%E2%99%A5-ea4aaa?style=for-the-badge&logo=githubsponsors&logoColor=white" alt="GitHub Sponsors" /></a>
  <a href="https://ko-fi.com/dontarken"><img src="https://img.shields.io/badge/Ko--fi-Soutenir-F16061?style=for-the-badge&logo=ko-fi&logoColor=white" alt="Ko-fi" /></a>
</p>

<p align="center">
  🇫🇷 <b>Français</b> &nbsp;|&nbsp; <a href="README.md">🇬🇧 Read in English</a>
</p>

---

## ⚡ Pourquoi utiliser ce plugin ?

Vous utilisez **Motrix** au quotidien et possédez un compte premium **Real-Debrid** ?

Ce plugin officiel communautaire (`.moext`) transforme Motrix en une alternative moderne, légère et élégante à **JDownloader** :
- **Débridage 100 % automatique** : Collez n'importe quel lien supporté (1fichier, Rapidgator, Mega, Turbobit, Katfile, DDownload, etc.), Motrix résout immédiatement le flux direct haute vitesse.
- **Débit maximal** : Exploite pleinement votre connexion fibre gigabit (jusqu'à 100+ Mo/s) grâce au moteur multi-connexions Aria2 de Motrix.
- **Configuration simplifiée** : Collez simplement votre jeton personnel d'API dans les réglages de l'extension.
- **100 % autonome** : Fonctionne directement dans Motrix 2.0+ standard, sans patch ni programme externe tiers.

---

## 🚀 Guide d'installation rapide

### Étape 1 : Installer l'extension dans Motrix

#### ⚡ Méthode A : Glisser-déposer (Le plus rapide)
1. Téléchargez la dernière version de **`realdebrid-resolver.moext`** depuis les [Releases GitHub](https://github.com/DonTarken/motrix-plugin-realdebrid/releases/latest).
2. Ouvrez **Motrix** et **glissez-déposez** le fichier `.moext` directement sur la fenêtre.
3. Vérifiez les autorisations requises (*http*, *notify*, *storage*) et cliquez sur **Installer**.

#### 🌐 Méthode B : Directement via GitHub
1. Dans Motrix, ouvrez l'onglet **"Extensions"** dans la barre latérale gauche (icône 📦).
2. Cliquez sur le bouton **`+`** en haut à droite.
3. Saisissez :
   ```text
   DonTarken/motrix-plugin-realdebrid
   ```
4. Cliquez sur **Confirmer** pour télécharger et installer.

---

### Étape 2 : Configurer votre jeton d'API Real-Debrid

1. Rendez-vous sur la page officielle de votre jeton Real-Debrid :  
   👉 **[https://real-debrid.com/apitoken](https://real-debrid.com/apitoken)**
2. Copiez votre jeton d'API secret.
3. Dans Motrix, ouvrez **Extensions** ➔ **Solveur Real-Debrid** ➔ onglet **Paramètres**.
4. Collez votre jeton dans le champ **Jeton d'API Real-Debrid**.
5. Cliquez sur **Appliquer**.

---

## 🎯 Fonctionnement

1. Dans Motrix, cliquez sur le gros **`+`** pour ajouter un téléchargement.
2. Collez l'adresse d'un hébergeur pris en charge (ex. `https://rapidgator.net/file/...` ou `https://1fichier.com/?...`).
3. Le plugin intercepte l'URL, demande un lien direct à Real-Debrid, et transmet le lien ultra-rapide à Aria2.
4. Votre téléchargement démarre immédiatement à pleine vitesse !

---

## 💬 Retours et Signalements de bugs

- 🐛 **[Signaler un problème](https://github.com/DonTarken/motrix-plugin-realdebrid/issues/new?template=bug_report.yml)** : Si un lien ne se débride pas ou en cas d'erreur.
- ✅ **[Confirmer un test / Débit](https://github.com/DonTarken/motrix-plugin-realdebrid/issues/new?template=test_confirmation.yml)** : Testé avec succès sur votre compte ? Partagez vos débits et captures pour aider la communauté !
- 💡 **[Proposer une fonctionnalité](https://github.com/DonTarken/motrix-plugin-realdebrid/issues/new?template=feature_request.yml)** : Vos idées pour les prochaines versions.

---

## 💖 Soutenir le projet

Si cette extension vous fait gagner du temps et de la bande passante, n'hésitez pas à soutenir son créateur :

- 💖 **[Sponsoriser sur GitHub](https://github.com/sponsors/DonTarken)**
- ☕ **[M'offrir un café sur Ko-fi](https://ko-fi.com/dontarken)**

---

## 📄 Licence

MIT © [DonTarken](https://github.com/DonTarken)
