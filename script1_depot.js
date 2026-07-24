// ============================================================
// SCRIPT 1 — Formulaire de Dépôt (Form 1)
// À attacher à la feuille de réponses du Formulaire 1
// Déclencheur : Lors de l'envoi du formulaire (onFormSubmit)
// Prérequis   : Activer le service "Drive API" (v3) dans Services
// ============================================================

// ---- CONSTANTES À CONFIGURER AVANT DÉPLOIEMENT ----
const CFG = {
  // URL du Formulaire 2 (Décision)
  URL_FORM_VALIDATION: "https://docs.google.com/forms/d/e/1FAIpQLSf8_40my2WTUGvhh_KlOwOW6BfpUMdFQiRAUklElWiqttOrGQ/viewform",

  // IDs des questions pré-remplissables dans le Formulaire 2
  // Vérifiés le 24/07/2026 via FB_PUBLIC_LOAD_DATA_ du formulaire live, après
  // ajout de la question "Décision" (branchement Approbation/Refus en
  // sections) : le formulaire n'affiche désormais QUE le champ Processus
  // pertinent selon la réponse à "Décision" (cf. script2_decision.js pour la
  // logique de lecture, inchangée -- elle infère toujours de quel champ
  // Processus est rempli, indépendamment du mécanisme de branchement).
  ENTRY_SIGNATURE_ID: "entry.1011529723",  // Identifiant de signature
  ENTRY_DECISION:     "entry.1985433554",  // Décision (J'approuve / Je refuse) -- pilote le branchement de section
  ENTRY_APPROUVES:    "entry.314648121",   // Processus approuvé(s)
  ENTRY_REFUSES:      "entry.1659432920",  // Processus refusé(s)

  // IDs des Google Sheets
  ID_SHEET_CONFIG:   "1-2RpSS6n8FyKhD9rGVGxqFlmJKTfXd0bm3ylZxm6pFA",
  ID_SHEET_TRACKER:  "1-2RpSS6n8FyKhD9rGVGxqFlmJKTfXd0bm3ylZxm6pFA",

  // Noms des onglets dans les Sheets
  NOM_ONGLET_CONFIG:   "Config_Signataires",
  NOM_ONGLET_TRACKER:  "Tracker",
};

// ---- ORDRE DES COLONNES DANS LA RÉPONSE DU FORMULAIRE 1 ----
// NB : Google Forms ajoute les colonnes de réponse dans l'ordre de CRÉATION
// des questions, pas selon leur position visuelle dans le formulaire. Les
// questions "Validateur BE" et "Validateur exceptionnel" ont été ajoutées le
// 24/07/2026 et sont donc en fin de feuille (colonnes I/J) même si elles
// apparaissent en position 1 dans le formulaire visible par le déposant.
const FORM1 = {
  TIMESTAMP:               0,
  EMAIL_DEPOSANT:          1,  // Adresse e-mail (colonne B)
  REF_PRODUIT:             2,  // Référence produit (colonne C)
  NO_REVISION:             3,  // Numéro de révision (colonne D)
  NOM_CLIENT:              4,  // Nom du client (colonne E)
  PROCESSUS:               5,  // Processus modifiés (colonne F)
  URL_FICHIER:             6,  // Fichier source (.docx) (colonne G)
  SOUS_TRAITANCE:          7,  // Sous-traitance (colonne H, facultatif)
  VALIDATEUR_BE:           8,  // Mathieu / Hervé (colonne I)
  VALIDATEUR_EXCEPTIONNEL: 9,  // Email libre, facultatif (colonne J)
};

// Mathieu et Hervé (BE) ne sont jamais tous les deux signataires d'un même
// produit : le déposant choisit lequel des deux est concerné en question 1
// du Formulaire 1, l'autre est retiré de la liste des validateurs pour tous
// les processus où il est configuré dans Config_Signataires (décision
// Sandrine, 24/07/2026).
const EMAIL_HERVE   = 'h.megnien@tb-groupe.fr';
const EMAIL_MATHIEU = 'm.berard@tb-groupe.fr';

// ---- INDEX DES COLONNES DANS LE TRACKER SHEET (0-based) ----
const COL = {
  REF_DOC:          0,   // A
  CLIENT:           1,   // B
  GOOGLE_DOC_ID:    2,   // C
  PROCESSUS:        3,   // D
  EMAIL_VALID:      4,   // E
  SIGNATURE_ID:     5,   // F
  STATUT:           6,   // G
  DATE_SOUMISSION:  7,   // H
  DATE_VALIDATION:  8,   // I
  EMAIL_DEPOSANT:   9,   // J
  NOM_DEPOSANT:     10,  // K
};

// ---- POINT D'ENTRÉE PRINCIPAL ----
function surNouvelleDemande(e) {
  _logToSheet("INFO", "Début surNouvelleDemande");

  // Verrou anti-double-exécution : deux triggers (ou deux soumissions quasi
  // simultanées) qui tournent en parallèle sur le même Doc provoquent des
  // "Action not allowed" lors de l'écriture Google Docs. Le lock sérialise.
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (lockErr) {
    _logToSheet("ERREUR", "Verrou non obtenu (exécution concurrente) : " + lockErr.message);
    return;
  }

  try {
    if (!e || !e.values) {
      const msg = "[ERREUR] Le script a été exécuté manuellement sans données de formulaire. Pour le tester, veuillez soumettre le Google Form en direct.";
      console.error(msg);
      _logToSheet("ERREUR", msg);
      return;
    }

    const valeurs = e.values;
    _logToSheet("INFO", "[DIAGNOSTIC] Valeurs brutes reçues : " + JSON.stringify(valeurs));

    // Vérification de la présence de toutes les colonnes de base requises
    if (valeurs.length < 7) {
      const msg = `[ERREUR] Le formulaire n'a pas renvoyé assez de colonnes (reçu : ${valeurs.length}, attendu : 7 minimum).`;
      console.error(msg);
      _logToSheet("ERREUR", msg);
      return;
    }

    const emailDeposant = valeurs[FORM1.EMAIL_DEPOSANT] ? valeurs[FORM1.EMAIL_DEPOSANT].trim() : '';
    const nomDeposant   = _nomDepuisEmail(emailDeposant);
    const refProduit    = valeurs[FORM1.REF_PRODUIT] ? valeurs[FORM1.REF_PRODUIT].trim() : '';
    const noRevision    = valeurs[FORM1.NO_REVISION] ? valeurs[FORM1.NO_REVISION].trim().padStart(3, '0') : '001';
    const nomClient     = valeurs[FORM1.NOM_CLIENT] ? valeurs[FORM1.NOM_CLIENT].trim() : 'INCONNU';
    const urlFichier    = valeurs[FORM1.URL_FICHIER] ? valeurs[FORM1.URL_FICHIER].trim() : '';
    const processusRaw  = valeurs[FORM1.PROCESSUS] || '';
    // NB (24/07/2026) : le champ Google Forms "Sous-traitance" est un choix
    // unique avec options "OUI"/"NON" (majuscules) -- PAS "Oui"/"Non". Une
    // comparaison sensible à la casse ici faisait échouer silencieusement la
    // détection de sous-traitance : tous les validateurs du processus étaient
    // notifiés au lieu du seul Alexandre Devaux (bug remonté par Antho).
    const sousTraitance = valeurs[FORM1.SOUS_TRAITANCE] ? valeurs[FORM1.SOUS_TRAITANCE].trim().toUpperCase() : 'NON';

    // Choix Mathieu / Hervé (question 1 du formulaire, colonne I) : détermine
    // lequel des deux retirer de la liste des validateurs -- jamais les deux
    // en même temps sur un même produit.
    const validateurBE = valeurs[FORM1.VALIDATEUR_BE] ? valeurs[FORM1.VALIDATEUR_BE].trim().toUpperCase() : '';
    let emailBeAExclure = null;
    if (validateurBE === 'HERVE' || validateurBE === 'HERVÉ') {
      emailBeAExclure = EMAIL_MATHIEU;
    } else if (validateurBE === 'MATHIEU') {
      emailBeAExclure = EMAIL_HERVE;
    } else {
      _logToSheet("WARN", `Choix Mathieu/Hervé absent ou non reconnu ("${validateurBE}") -- Hervé et Mathieu seront TOUS LES DEUX sollicités si configurés sur un processus.`);
    }

    // Validateur exceptionnel ajouté manuellement par Sandrine (facultatif) :
    // s'ajoute comme signataire supplémentaire sur TOUS les processus soumis,
    // peu importe lesquels (décision Sandrine, 24/07/2026).
    const validateurExceptionnel = valeurs[FORM1.VALIDATEUR_EXCEPTIONNEL] ? valeurs[FORM1.VALIDATEUR_EXCEPTIONNEL].trim() : '';
    if (validateurExceptionnel && !validateurExceptionnel.includes('@')) {
      _logToSheet("WARN", `Validateur exceptionnel ignoré, ne ressemble pas à un email : "${validateurExceptionnel}"`);
    }

    if (!urlFichier) {
      const msg = "[ERREUR] L'URL du fichier déposé est vide.";
      console.error(msg);
      _logToSheet("ERREUR", msg);
      return;
    }

    // Construction de la référence normalisée : FOR-PRO-Comp0500070-REV007
    const reference = `FOR-PRO-${refProduit}-REV${noRevision}`;
    _logToSheet("INFO", "Référence construite : " + reference);

    // Parsing des processus sélectionnés
    const processusSelectionnes = processusRaw
      .split(',')
      .map(p => p.trim())
      .filter(p => p.length > 0);

    if (processusSelectionnes.length === 0) {
      const msg = `[ERREUR] Aucun processus sélectionné pour ${reference}`;
      console.error(msg);
      _logToSheet("ERREUR", msg);
      return;
    }

    // Récupération du fichier Drive et renommage
    const idFichier = _extraireIdDrive(urlFichier);
    if (!idFichier) {
      const msg = `[ERREUR] ID Drive introuvable dans l'URL : ${urlFichier}`;
      console.error(msg);
      _logToSheet("ERREUR", msg);
      return;
    }

    _logToSheet("INFO", "Fichier source ID : " + idFichier + " - Conversion en cours...");
    // Conversion .docx → Google Doc natif
    const idGoogleDoc = _convertirEnGoogleDoc(idFichier, reference);
    _logToSheet("INFO", `[OK] Google Doc créé : ${idGoogleDoc}`);

    // Chargement de la config processus → validateurs
    const configMap = _chargerConfigSignataires();
    if (Object.keys(configMap).length === 0) {
      const msg = "[ERREUR] Impossible de charger la configuration des signataires (la table de correspondance est vide).";
      console.error(msg);
      _logToSheet("ERREUR", msg);
      return;
    }

    // Chargement du Tracker
    const trackerSheet = SpreadsheetApp
      .openById(CFG.ID_SHEET_TRACKER)
      .getSheetByName(CFG.NOM_ONGLET_TRACKER);

    if (!trackerSheet) {
      const msg = `[ERREUR] Onglet '${CFG.NOM_ONGLET_TRACKER}' introuvable.`;
      console.error(msg);
      _logToSheet("ERREUR", msg);
      return;
    }

    // Récupération de l'existant pour la relance ciblée
    // Clé "PROCESSUS|email" (et non PROCESSUS seul) : toutes les signatures
    // sont nécessaires, chaque validateur d'un même processus a sa propre
    // ligne de suivi (confirmé par Antho — pas de "premier qui répond gagne").
    const donneesTracker = trackerSheet.getDataRange().getValues();
    const existantMap = {}; // { "PROCESSUS|email": { rowIndex, statut, validateur, signatureId, dateValidation } }
    for (let i = 1; i < donneesTracker.length; i++) {
      if (donneesTracker[i][COL.REF_DOC] === reference) {
        const proc = donneesTracker[i][COL.PROCESSUS].toUpperCase();
        const email = donneesTracker[i][COL.EMAIL_VALID];
        existantMap[`${proc}|${email}`] = {
          rowIndex: i + 1,
          statut: donneesTracker[i][COL.STATUT],
          validateur: email,
          signatureId: donneesTracker[i][COL.SIGNATURE_ID],
          dateValidation: donneesTracker[i][COL.DATE_VALIDATION]
        };
      }
    }

    // Regroupement par validateur : email -> [{ processus, rowIndex, isNew }]
    const emailMap = new Map();

    processusSelectionnes.forEach(processus => {
      let emailsValidateurs = [];
      if (sousTraitance === 'OUI') {
        // En cas de sous-traitance, seul Alex est signataire pour tous les processus
        emailsValidateurs = ['a.devaux@tb-groupe.fr'];
      } else {
        emailsValidateurs = (configMap[processus.toUpperCase()] || []).slice();

        // Retrait du BE non concerné par ce produit (Mathieu XOR Hervé, jamais les deux)
        if (emailBeAExclure) {
          emailsValidateurs = emailsValidateurs.filter(
            e => e.toLowerCase() !== emailBeAExclure.toLowerCase()
          );
        }

        // Ajout du validateur exceptionnel de Sandrine sur ce processus (et
        // donc sur tous les processus, puisque cette boucle s'exécute pour
        // chacun d'eux), s'il n'y est pas déjà.
        if (validateurExceptionnel && validateurExceptionnel.includes('@')) {
          const dejaPresent = emailsValidateurs.some(
            e => e.toLowerCase() === validateurExceptionnel.toLowerCase()
          );
          if (!dejaPresent) emailsValidateurs.push(validateurExceptionnel);
        }
      }

      if (emailsValidateurs.length === 0) {
        const msg = `[WARN] Aucun validateur configuré pour : "${processus}"`;
        console.warn(msg);
        _logToSheet("WARN", msg);
        return;
      }

      const procKey = processus.toUpperCase();

      // Toutes les signatures sont nécessaires : chaque validateur configuré
      // pour ce processus doit approuver individuellement.
      emailsValidateurs.forEach(emailValidateur => {
        const cleExistant = `${procKey}|${emailValidateur}`;
        const existant = existantMap[cleExistant];

        if (existant) {
          if (existant.statut === 'APPROUVÉ') {
            // Si déjà validé, on met à jour l'ID du Google Doc dans le tracker
            trackerSheet.getRange(existant.rowIndex, COL.GOOGLE_DOC_ID + 1).setValue(idGoogleDoc);
            // Et on ré-injecte la signature dans la nouvelle copie du document
            try {
              _insererSignatureDansTableau(idGoogleDoc, processus, existant.validateur, existant.signatureId, existant.dateValidation, noRevision);
              _logToSheet("INFO", `Signature ré-injectée dans le nouveau document pour : ${processus} (${emailValidateur})`);
            } catch (err) {
              _logToSheet("WARN", `Échec ré-injection signature pour ${processus}/${emailValidateur} : ${err.message}`);
            }
          } else {
            // Était REFUSÉ ou EN_ATTENTE : relance requise
            if (!emailMap.has(emailValidateur)) emailMap.set(emailValidateur, []);
            emailMap.get(emailValidateur).push({ processus, rowIndex: existant.rowIndex, isNew: false });
          }
        } else {
          // Nouveau (processus, validateur) non présent dans la révision précédente
          if (!emailMap.has(emailValidateur)) emailMap.set(emailValidateur, []);
          emailMap.get(emailValidateur).push({ processus, isNew: true });
        }
      });
    });

    // Annulation des processus qui ne font plus partie de la sélection sur cette révision
    Object.keys(existantMap).forEach(cle => {
      const proc = cle.split('|')[0];
      const selectionne = processusSelectionnes.some(p => p.toUpperCase() === proc);
      if (!selectionne && existantMap[cle].statut !== 'ANNULÉ') {
        const row = existantMap[cle].rowIndex;
        trackerSheet.getRange(row, COL.STATUT + 1).setValue('ANNULÉ');
        _logToSheet("INFO", `Processus ${proc} retiré de la demande -> Statut : ANNULÉ (${existantMap[cle].validateur})`);
      }
    });

    // Traitement et notification pour chaque validateur (1 seul mail par validateur,
    // mais 1 Signature_ID PAR PROCESSUS -- indispensable : script2 retrouve la ligne
    // Tracker à mettre à jour uniquement via Signature_ID, donc un ID partagé entre
    // plusieurs processus d'un même validateur rendrait la mise à jour ambiguë
    // (mauvaise ligne validée si le validateur a plusieurs processus en attente).
    emailMap.forEach((items, emailValidateur) => {
      const itemsAvecSignature = items.map(item => ({ ...item, signatureId: _genererSignatureId() }));

      itemsAvecSignature.forEach(item => {
        if (item.isNew) {
          trackerSheet.appendRow([
            reference,       // A : Ref_Doc
            nomClient,       // B : Client
            idGoogleDoc,     // C : Google_Doc_ID
            item.processus,  // D : Processus
            emailValidateur, // E : Validateur_Email
            item.signatureId,// F : Signature_ID
            'EN_ATTENTE',    // G : Statut
            new Date(),      // H : Date_Soumission
            '',              // I : Date_Validation
            emailDeposant,   // J : Email_Deposant
            nomDeposant,     // K : Nom_Deposant
          ]);
          _logToSheet("INFO", `Ajout tracker : ${reference} | Proc: ${item.processus} | Valid: ${emailValidateur} | SigID: ${item.signatureId}`);
        } else {
          trackerSheet.getRange(item.rowIndex, COL.GOOGLE_DOC_ID + 1).setValue(idGoogleDoc);
          trackerSheet.getRange(item.rowIndex, COL.SIGNATURE_ID + 1).setValue(item.signatureId);
          trackerSheet.getRange(item.rowIndex, COL.STATUT + 1).setValue('EN_ATTENTE');
          trackerSheet.getRange(item.rowIndex, COL.DATE_SOUMISSION + 1).setValue(new Date());
          trackerSheet.getRange(item.rowIndex, COL.DATE_VALIDATION + 1).setValue('');
          _logToSheet("INFO", `Mise à jour tracker pour relance : ${reference} | Proc: ${item.processus} | Valid: ${emailValidateur} | SigID: ${item.signatureId}`);
        }
      });

      _logToSheet("INFO", `Envoi e-mail à ${emailValidateur} pour ${itemsAvecSignature.length} processus...`);
      _envoyerEmailDemande(emailValidateur, reference, nomClient, idGoogleDoc, itemsAvecSignature);
      _logToSheet("INFO", `E-mail envoyé à ${emailValidateur}`);
    });

    const successMsg = `[OK] Dépôt traité : ${reference} — ${processusSelectionnes.length} processus.`;
    console.log(successMsg);
    _logToSheet("INFO", successMsg);
  } catch (err) {
    const errorMsg = `[CRITIQUE] Erreur inattendue dans surNouvelleDemande : ${err.message}\n${err.stack}`;
    console.error(errorMsg);
    _logToSheet("ERREUR", errorMsg);
  } finally {
    lock.releaseLock();
  }
}

function _logToSheet(niveau, message) {
  try {
    const ss = SpreadsheetApp.openById(CFG.ID_SHEET_TRACKER);
    let sheet = ss.getSheetByName("Logs");
    if (!sheet) {
      sheet = ss.insertSheet("Logs");
      sheet.appendRow(["Horodateur", "Niveau", "Message"]);
    }
    sheet.appendRow([new Date(), niveau, message]);
  } catch (err) {
    console.error("Impossible d'écrire dans les logs : " + err.message);
  }
}

// ================================================================
// FONCTIONS UTILITAIRES
// ================================================================

function _convertirEnGoogleDoc(idFichierSource, nomDocument) {
  const fichier = DriveApp.getFileById(idFichierSource);
  const mimeType = fichier.getMimeType();

  if (mimeType === 'application/vnd.google-apps.document') {
    const copie = fichier.makeCopy(`[WIP] ${nomDocument}`);
    return copie.getId();
  } else {
    const blob = fichier.getBlob();
    const metadata = {
      name: `[WIP] ${nomDocument}`,
      mimeType: 'application/vnd.google-apps.document'
    };
    const fichierConverti = Drive.Files.create(metadata, blob);
    return fichierConverti.id;
  }
}

function _chargerConfigSignataires() {
  const sheet = SpreadsheetApp
    .openById(CFG.ID_SHEET_CONFIG)
    .getSheetByName(CFG.NOM_ONGLET_CONFIG);

  const donnees = sheet.getDataRange().getValues();
  const configMap = {};

  for (let i = 1; i < donnees.length; i++) {
    const processus = donnees[i][0].toString().trim().toUpperCase();
    const emailsRaw = donnees[i][1].toString();
    const emails = emailsRaw
      .split(',')
      .map(e => e.trim())
      .filter(e => e.includes('@'));

    if (processus && emails.length > 0) {
      configMap[processus] = emails;
    }
  }
  return configMap;
}

function _genererSignatureId() {
  const d = new Date();
  const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const suffixe = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `SIG-${date}-${suffixe}`;
}

function _nomDepuisEmail(email) {
  try {
    const sheet = SpreadsheetApp
      .openById(CFG.ID_SHEET_CONFIG)
      .getSheetByName('Utilisateurs');
    if (!sheet) return email;
    const donnees = sheet.getDataRange().getValues();
    for (let i = 1; i < donnees.length; i++) {
      if (donnees[i][0].toString().trim().toLowerCase() === email.toLowerCase()) {
        return donnees[i][1].toString().trim();
      }
    }
  } catch(e) {
    console.warn(`[WARN] Lookup nom impossible pour ${email} : ${e.message}`);
  }
  return email.split('@')[0].replace('.', ' ');
}

function _extraireIdDrive(url) {
  if (!url) return null;
  let m = url.match(/\/d\/([^\/\?]+)/);
  if (m) return m[1];
  m = url.match(/[?&]id=([^&]+)/);
  if (m) return m[1];
  return null;
}

/**
 * Envoie un unique e-mail par validateur, avec DEUX BOUTONS PAR PROCESSUS
 * (Approuver / Refuser). Depuis le 24/07/2026, le Formulaire 2 a une question
 * "Décision" (J'approuve / Je refuse) qui déclenche un branchement de section :
 * seul le champ Processus pertinent est affiché au validateur (fini le risque
 * de confusion Approuvé + Refusé simultanément, demande Sandrine 24/07/2026).
 * Chaque bouton pré-remplit donc AUSSI ENTRY_DECISION avec la valeur exacte
 * ("J'approuve" ou "Je refuse") en plus du champ Processus correspondant --
 * le champ Processus de l'autre décision reste vide et n'est de toute façon
 * plus affiché au validateur grâce au branchement de section.
 * Chaque bouton pré-remplit aussi le Signature_ID qui LUI est propre : le
 * Formulaire 2 étant "1 processus + 1 décision par soumission" dans son
 * architecture réelle, un lien groupé rendait impossible de savoir sans
 * ambiguïté quel processus le validateur voulait traiter (script2 fait de
 * toute façon foi sur le Tracker pour le processus, pas sur ce champ, en
 * filet de sécurité supplémentaire).
 */
function _envoyerEmailDemande(emailValidateur, reference, nomClient, idGoogleDoc, items) {
  const lienDocument = `https://docs.google.com/document/d/${idGoogleDoc}/edit`;

  const sujet = `[VALIDATION REQUISE] ${reference} — Client : ${nomClient}`;

  let boutonsHtml = '';
  items.forEach(({ processus, signatureId }) => {
    const base = CFG.URL_FORM_VALIDATION
      + `?usp=pp_url`
      + `&${CFG.ENTRY_SIGNATURE_ID}=${encodeURIComponent(signatureId)}`;
    const lienApprouver = `${base}&${CFG.ENTRY_DECISION}=${encodeURIComponent("J'approuve")}&${CFG.ENTRY_APPROUVES}=${encodeURIComponent(processus)}`;
    const lienRefuser   = `${base}&${CFG.ENTRY_DECISION}=${encodeURIComponent("Je refuse")}&${CFG.ENTRY_REFUSES}=${encodeURIComponent(processus)}`;

    boutonsHtml += `
      <div style="display:flex; align-items:center; justify-content:space-between; background:#f9fafb; border-left:4px solid #1a56db; padding:10px 16px; margin:8px 0;">
        <span style="font-weight:bold; font-size:14px;">${processus}</span>
        <span>
          <a href="${lienApprouver}"
             style="display:inline-block; background:#22c55e; color:white; padding:8px 16px;
                    text-decoration:none; border-radius:5px; font-weight:bold; font-size:13px; margin-left:8px;">
            ✓ Approuver
          </a>
          <a href="${lienRefuser}"
             style="display:inline-block; background:#c0392b; color:white; padding:8px 16px;
                    text-decoration:none; border-radius:5px; font-weight:bold; font-size:13px; margin-left:8px;">
            ✗ Refuser
          </a>
        </span>
      </div>`;
  });

  const corps = `
    <div style="font-family:Arial, sans-serif; color:#1a1a1a; max-width:700px; line-height: 1.5;">
      <p>Bonjour,</p>
      <p>Une fiche produit nécessite votre validation pour le client <strong>${nomClient}</strong>.</p>

      <p>
        <a href="${lienDocument}"
           style="color:#1a56db; font-weight:bold; font-size:15px; text-decoration:underline;">
          📄 Étape 1 — Consulter le document : ${reference}
        </a>
      </p>

      <p><strong>Étape 2 — Rendre votre décision, processus par processus :</strong></p>
      <p style="color:#555; font-size:13px;">
        Cliquez sur "Approuver" ou "Refuser" en face du processus concerné. Le formulaire qui s'ouvre est déjà pré-rempli pour ce processus et cette décision -- en cas de refus, précisez simplement le motif avant de valider.
      </p>

      ${boutonsHtml}

      <p style="margin-top:24px; font-size:12px; color:#888;">
        Si vous n'êtes pas le destinataire visé, ignorez cet e-mail.
      </p>
    </div>`;

  MailApp.sendEmail({ to: emailValidateur, subject: sujet, htmlBody: corps });
}

// ================================================================
// RÉ-INJECTION DES SIGNATURES EXISTANTES (PAGE 2)
// ================================================================

function _insererSignatureDansTableau(idGoogleDoc, nomProcessus, emailValidateur, signatureId, dateValidation, noRevision) {
  const doc  = DocumentApp.openById(idGoogleDoc);
  const body = doc.getBody();

  const tableHistorique = _trouverTableauHistorique(body);
  if (!tableHistorique) {
    throw new Error('Tableau HISTORIQUE DES RÉVISIONS introuvable.');
  }

  const nomProcessusNormalise = nomProcessus.trim().toUpperCase();
  const dateStr = Utilities.formatDate(new Date(dateValidation), Session.getScriptTimeZone(), 'dd/MM/yyyy');
  const texteValideur = `${emailValidateur}\n${signatureId}`;

  let ligneEcrite = false;
  const numRows = tableHistorique.getNumRows();

  for (let i = 1; i < numRows; i++) {
    const cellProcessus = tableHistorique.getCell(i, 0).getText().trim().toUpperCase();

    if (cellProcessus === nomProcessusNormalise) {
      const valideurExistant = tableHistorique.getCell(i, 4).getText().trim();
      if (!valideurExistant) {
        tableHistorique.getCell(i, 1).setText(dateStr);
        tableHistorique.getCell(i, 4).setText(texteValideur);
        tableHistorique.getCell(i, 5).setText(noRevision);
        ligneEcrite = true;
        break;
      }
    }
  }

  if (!ligneEcrite) {
    const derniereIndex = _trouverDerniereIndexProcessus(tableHistorique, nomProcessusNormalise, numRows);
    if (derniereIndex >= 0) {
      // NB : Table.insertRows() n'existe pas dans l'API Google Apps Script
      // (c'est ça qui provoquait "insertRows is not a function"). La méthode
      // correcte est insertTableRow(index, ligneModele) qui clone la structure
      // (nb de colonnes/style) d'une ligne existante.
      const ligneModele = tableHistorique.getRow(numRows - 1);
      const nouvelleLigne = tableHistorique.insertTableRow(derniereIndex + 1, ligneModele);
      nouvelleLigne.getCell(0).setText(nomProcessus);
      nouvelleLigne.getCell(1).setText(dateStr);
      nouvelleLigne.getCell(4).setText(texteValideur);
      nouvelleLigne.getCell(5).setText(noRevision);
      ligneEcrite = true;
    }
  }

  doc.saveAndClose();
}

function _trouverTableauHistorique(body) {
  const tables = body.getTables();
  for (let t = 0; t < tables.length; t++) {
    const table = tables[t];
    if (table.getNumRows() > 0) {
      const premiereCellule = table.getCell(0, 0).getText().toUpperCase();
      if (premiereCellule.includes('PROCESSUS') || premiereCellule.includes('HISTORIQUE')) {
        return table;
      }
    }
  }
  return null;
}

function _trouverDerniereIndexProcessus(table, nomProcessusNormalise, numRows) {
  let dernierIndex = -1;
  for (let i = 1; i < numRows; i++) {
    if (table.getCell(i, 0).getText().trim().toUpperCase() === nomProcessusNormalise) {
      dernierIndex = i;
    }
  }
  return dernierIndex;
}
