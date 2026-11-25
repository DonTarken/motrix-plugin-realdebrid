# Plugin Real-Debrid pour Motrix

<p align="center">
  <img src="assets/realdebrid-logo.png" alt="Real-Debrid Logo" height="38" />
  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <img src="assets/motrix-logo.png" alt="Motrix Logo" height="38" />
</p>

<p align="center">
  <a href="https://github.com/DonTarken/motrix-plugin-realdebrid/releases/latest"><img src="https://img.shields.io/github/v/release/DonTarken/motrix-plugin-realdebrid?label=Derni%C3%A8re%20version&color=success&style=for-the-badge" alt="Dernière version" /></a>
  <a href="https://motrix.app"><img src="https://img.shields.io/badge/Motrix-%3E%3D%202.0.0-orange?style=for-the-badge" alt="Motrix 2.0+" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/Licence-MIT-blue?style=for-the-badge" alt="Licence MIT" /></a>
  <a href="https://github.com/sponsors/DonTarken"><img src="https://img.shields.io/badge/Sponsor-GitHub-ea4aaa?style=for-the-badge&logo=githubsponsors&logoColor=white" alt="Sponsoriser sur GitHub" /></a>
  <a href="https://ko-fi.com/dontarken"><img src="https://img.shields.io/badge/Ko--fi-Soutenir%20le%20projet-F16061?style=for-the-badge&logo=ko-fi&logoColor=white" alt="Soutenir sur Ko-fi" /></a>
</p>

<p align="center">
  🇫🇷 <b>Français</b> &nbsp;|&nbsp; <a href="README.md">🇬🇧 English</a>
</p>

---

## Pourquoi ce plugin ?

Vous utilisez **Motrix** comme gestionnaire de téléchargement et vous possédez un compte premium **Real-Debrid** ?

Ce plugin autonome (`.moext`) transforme Motrix en une alternative moderne, rapide et légère à **JDownloader** :
- **Débridage 100 % automatique** : collez vos liens (1fichier, Rapidgator, Turbobit, Mega, Katfile, Nitroflare, etc.), Motrix les débride et lance le téléchargement direct via l'API REST officielle Real-Debrid v1.0.
- **Configuration intégrée dans Motrix** : enregistrez et testez votre token API directement depuis l'onglet **Opérations** de l'extension dans Motrix.
- **Protection contre les pages HTML** : si un lien ne peut pas être débridé (abonnement inactif, fichier mort, clé manquante), Motrix annule le téléchargement et vous alerte au lieu de télécharger une page HTML.
- **Vitesse maximale** : exploite pleinement votre connexion via le moteur multi-connexions Aria2.
- **Suite de tests automatisés** : valide la politique fail-closed, l'isolation Bearer, la conformité au schéma Motrix et la gestion des erreurs.

---

## 🚀 Tutoriel d'Installation Rapide

### Étape 1 : Installer l'extension dans Motrix (au choix)

#### Méthode A : Directement via GitHub (Recommandée — la plus simple)
1. Ouvrez **Motrix** et cliquez sur l'onglet **« Extensions »** dans la barre latérale gauche (icône 📦 sous *Trackers*).
2. Cliquez sur le bouton **`+`** tout en haut à droite pour ouvrir la fenêtre *« Ajouter une extension »*.
3. Saisissez le nom du dépôt :
   ```text
   DonTarken/motrix-plugin-realdebrid
   ```
   *(Ne mettez pas `https://` devant pour que Motrix interroge directement les releases GitHub).*
4. Cliquez sur la loupe 🔍 (ou Entrée) puis confirmez l'installation.

---

#### 📁 Méthode B : Via le fichier `.moext` local
1. 👉 **[Télécharger `realdebrid-resolver.moext`](https://github.com/DonTarken/motrix-plugin-realdebrid/releases/latest/download/realdebrid-resolver.moext)** (dernière version).
2. Dans Motrix ➔ onglet **Extensions** ➔ cliquez sur le bouton **`+`** en haut à droite.
3. **Glissez-déposez** le fichier téléchargé dans le champ (ou choisissez-le via le trombone 📎) et confirmez l'installation.

---

### Étape 2 : Enregistrer et vérifier votre Token API Real-Debrid

> **Pourquoi passer par *Opérations* et non *Paramètres* ?** Motrix Desktop 2.4.x souffre actuellement d'un bug amont : les valeurs saisies dans l'onglet *Paramètres* ne sont pas transmises aux extensions au runtime. L'onglet **Opérations** enregistre votre clé de façon fiable dans le stockage SQLite local de Motrix.

1. Récupérez votre token API personnel sur **[real-debrid.com/apitoken](https://real-debrid.com/apitoken)**.
2. Dans Motrix, ouvrez **Extensions** ➔ **Real-Debrid Resolver**.
3. Ouvrez l'onglet **Opérations** (**Compte & Paramètres**).
4. Collez votre token dans **Token API Real-Debrid** et cliquez sur **Enregistrer et vérifier**.
5. Motrix vérifie immédiatement votre compte et affiche votre offre ainsi que la date d'expiration !
   *(Vous pouvez aussi décocher **Bloquer le téléchargement en cas d'échec** dans Opérations si vous préférez laisser passer le lien d'origine en cas d'erreur sans risquer la coupure automatique de Motrix après 3 échecs.)*

*(Raccourci alternatif : coller `https://real-debrid.com/set-key/VOTRE_TOKEN_API` dans **Ajouter un téléchargement (+)** enregistre également votre token directement.)*

---

## 💡 Utilisation au Quotidien

* **Téléchargement unique :** Collez n'importe quel lien hébergeur dans Motrix (`Ctrl + N` ou bouton `+`).
* **Téléchargements par lot :** Collez 10, 20 ou 50 liens d'archives découpées (`.part01.rar`, `.part02.rar`...) ; tous les liens sont débridés et mis en file d'attente en parallèle.
* **Extension de navigateur :** Utilisez l'extension Chrome ou Firefox de Motrix pour faire un clic droit **« Télécharger avec Motrix »**.

---

## ❓ FAQ & Dépannage

<details>
<summary><b>Ma vitesse oscille ou la barre reste bloquée à 0 o/s ?</b></summary>
<br>

Si vous téléchargez de très gros fichiers (ex : vidéos de 20 à 60 Go), vérifiez où Motrix écrit :
- **Privilégiez un SSD (SATA ou NVMe)** plutôt qu'un disque dur mécanique 5400 tr/min.
- Sur un disque dur lent, la pré-allocation d'espace peut saturer les files d'attente disque et retarder temporairement les statistiques Aria2.
</details>

<details>
<summary><b>Quels hébergeurs sont supportés ?</b></summary>
<br>

Tous les hébergeurs pris en charge par votre compte Real-Debrid (plus de 280 domaines : 1fichier, Rapidgator, Turbobit, Mega, Katfile, DDownload, Filefactory, Nitroflare, etc.). La liste est rafraîchie automatiquement toutes les heures.
</details>

<details>
<summary><b>Pourquoi le plugin demande-t-il l'accès hôte (*://*/*) ?</b></summary>
<br>

Motrix vérifie `hostPermissions` avant même de déclencher le hook `beforeCreate`. Comme Real-Debrid supporte plus de 280 domaines récupérés dynamiquement, ce motif générique est nécessaire pour que Motrix transmette les liens entrants au plugin. **Sécurité fail-closed** : le plugin filtre d'abord en local contre la liste officielle Real-Debrid, et les liens non supportés ne sont jamais envoyés à Real-Debrid.
</details>

<details>
<summary><b>Mes identifiants sont-ils en sécurité ?</b></summary>
<br>

**Oui.** Le plugin ne demande jamais votre mot de passe Real-Debrid. Votre token API reste stocké localement sur votre machine et n'est transmis qu'à `api.real-debrid.com` via l'en-tête `Authorization: Bearer`.
</details>

---

## 🐛 Retours, Tests & Signalements

* 👉 **[Fil de discussion](https://github.com/DonTarken/motrix-plugin-realdebrid/issues/1)** : Partagez vos retours et échangez sur les problèmes rencontrés.
* 👉 **[Signaler un bug](https://github.com/DonTarken/motrix-plugin-realdebrid/issues/new?template=bug_report.yml)** : En cas de comportement inattendu.
* 👉 **[Proposer une amélioration](https://github.com/DonTarken/motrix-plugin-realdebrid/issues/new?template=feature_request.yml)** : Proposez vos idées.

---

## 🛠️ Compilation depuis les sources (Développeurs)

```bash
git clone https://github.com/DonTarken/motrix-plugin-realdebrid.git
cd motrix-plugin-realdebrid

npm test
npm run build
```

Les paquets compilés `.moext` sont générés dans `dist/`.

---

## 💖 Soutenir le Projet

<p align="center">
  <a href="https://ko-fi.com/dontarken" target="_blank">
    <img src="https://storage.ko-fi.com/cdn/kofi3.png?v=3" height="40" alt="Buy Me a Coffee at ko-fi.com" />
  </a>
</p>

---

## 📄 Licence

Open-source sous licence **[MIT](LICENSE)** par **[DonTarken](https://github.com/DonTarken)**.
