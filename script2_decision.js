// ============================================================
// SCRIPT 2 — Formulaire de Décision (Form 2)
// À attacher à la feuille de réponses du Formulaire 2
// Déclencheur : Lors de l'envoi du formulaire (onFormSubmit)
// Prérequis   : Activer le service "Drive API" (v3) dans Services
//
// NB (22/07/2026) : ce fichier a été réaligné sur le code RÉELLEMENT déployé
// dans le projet Apps Script "Script2 Validation", qui avait divergé de la
// version précédente de ce repo (édité directement dans le navigateur, jamais
// commité). Architecture réelle : 1 ligne de Formulaire 2 = 1 processus + 1
// décision (pas de cases à cocher groupées). Toutes les signatures sont
// nécessaires : chaque validateur configuré pour un processus doit approuver
// individuellement (pas de "premier qui répond gagne").
// ============================================================

// ---- CONSTANTES (copier les mêmes valeurs que dans Script 1) ----
const CFG = {
  ID_SHEET_TRACKER:    "1-2RpSS6n8FyKhD9rGVGxqFlmJKTfXd0bm3ylZxm6pFA",
  ID_DOSSIER_SYLOB:    "10Hl9BAlG74XNt9BX03Q83DagCDHb7PuE",
  NOM_ONGLET_TRACKER:  "Tracker",
};

// ---- ORDRE DES COLONNES DANS LA RÉPONSE DU FORMULAIRE 2 ----
const FORM2 = {
  TIMESTAMP:       0,
  EMAIL_VALID:     1,  // "Votre adresse email" (colonne B)
  SIGNATURE_ID:    6,  // "Votre identifiant de signature" (colonne G)
  PROCESSUS:       7,  // "Processus que vous validez" (colonne H)
  DECISION:        8,  // "Votre décision" (colonne I)
  MOTIF_REFUS:     9,  // "Motif du refus" (colonne J)
};

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

const STATUT = {
  EN_ATTENTE: 'EN_ATTENTE',
  APPROUVE:   'APPROUVÉ',
  REFUSE:     'REFUSÉ',
  ANNULE:     'ANNULÉ',
};

const DECISION_APPROUVE = "J'approuve";

// ---- POINT D'ENTRÉE PRINCIPAL ----
function surDecision(e) {
  _logToSheet("INFO", "Début surDecision");

  // Verrou anti-double-exécution : les logs de production montraient chaque
  // soumission traitée deux fois (mails et écritures Doc dupliqués), causé par
  // un déclencheur onFormSubmit installé en double. Le lock protège même si
  // deux exécutions concurrentes se représentent (ex. relance manuelle).
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (lockErr) {
    _logToSheet("ERREUR", "Verrou non obtenu (exécution concurrente) : " + lockErr.message);
    return;
  }

  try {
    if (!e || !e.values) {
      const msg = "[ERREUR] Le script a été exécuté manuellement sans données. Veuillez soumettre le Formulaire 2 en direct.";
      console.error(msg);
      _logToSheet("ERREUR", msg);
      return;
    }

    const valeurs = e.values;
    _logToSheet("INFO", "[DIAGNOSTIC] Valeurs brutes reçues (Form 2) : " + JSON.stringify(valeurs));

    if (valeurs.length < 5) {
      const msg = `[ERREUR] Le formulaire de décision n'a pas assez de colonnes (reçu : ${valeurs.length}, attendu : 5 minimum).`;
      console.error(msg);
      _logToSheet("ERREUR", msg);
      return;
    }

    const emailValidateur = valeurs[FORM2.EMAIL_VALID] ? valeurs[FORM2.EMAIL_VALID].trim() : '';
    const signatureId     = valeurs[FORM2.SIGNATURE_ID] ? valeurs[FORM2.SIGNATURE_ID].trim() : '';
    const processus       = valeurs[FORM2.PROCESSUS] ? valeurs[FORM2.PROCESSUS].trim() : '';
    const decision        = valeurs[FORM2.DECISION] ? valeurs[FORM2.DECISION].trim() : '';
    const motifRefus      = valeurs[FORM2.MOTIF_REFUS] || '';

    if (!signatureId) {
      const msg = '[ERREUR] Signature ID manquant dans la réponse du formulaire.';
      console.error(msg);
      _logToSheet("ERREUR", msg);
      return;
    }

    _logToSheet("INFO", `Recherche de l'ID de signature : ${signatureId} dans le Tracker...`);

    // Chargement du Tracker
    const trackerSpreadsheet = SpreadsheetApp.openById(CFG.ID_SHEET_TRACKER);
    const trackerSheet = trackerSpreadsheet.getSheetByName(CFG.NOM_ONGLET_TRACKER);
    const donnees = trackerSheet.getDataRange().getValues();

    // Recherche de la ligne EN_ATTENTE correspondant à cet identifiant de signature
    let ligneIndex = -1;
    for (let i = 1; i < donnees.length; i++) {
      if (
        donnees[i][COL.SIGNATURE_ID] === signatureId &&
        donnees[i][COL.STATUT] === STATUT.EN_ATTENTE
      ) {
        ligneIndex = i;
        break;
      }
    }

    if (ligneIndex === -1) {
      const msg = `[WARN] Signature ID non trouvé ou déjà traité : ${signatureId}`;
      console.warn(msg);
      _logToSheet("WARN", msg);
      return;
    }

    // Récupération des métadonnées de ce document depuis le Tracker
    const refDoc        = donnees[ligneIndex][COL.REF_DOC];
    const nomClient     = donnees[ligneIndex][COL.CLIENT];
    const idGoogleDoc   = donnees[ligneIndex][COL.GOOGLE_DOC_ID];
    const emailDeposant = donnees[ligneIndex][COL.EMAIL_DEPOSANT];
    const nomDeposant   = donnees[ligneIndex][COL.NOM_DEPOSANT];
    const rowSheet      = ligneIndex + 1; // +1 car les données commencent à la ligne 2

    // Le Signature_ID est désormais unique par (validateur, processus) — généré
    // ainsi côté script1 — donc la ligne Tracker trouvée fait foi. On utilise SON
    // processus (colonne D), pas celui renvoyé par le formulaire : si le
    // validateur a plusieurs décisions à rendre et se trompe de ligne dans le
    // menu déroulant du Formulaire 2, la ligne Tracker (donc la signature écrite
    // dans le document) reste correcte plutôt que de suivre une saisie erronée.
    const processusTracker = donnees[ligneIndex][COL.PROCESSUS];
    if (processus && processus.trim().toUpperCase() !== processusTracker.trim().toUpperCase()) {
      _logToSheet("WARN", `Processus du formulaire ("${processus}") différent du Tracker ("${processusTracker}") pour SigID ${signatureId} — le Tracker fait foi.`);
    }

    _logToSheet("INFO", `Signature trouvée sur la ligne ${rowSheet} pour le document ${refDoc} (processus : ${processusTracker})`);

    if (decision === DECISION_APPROUVE) {
      _logToSheet("INFO", `Décision : Approbation pour le processus ${processusTracker}`);
      _traiterApprobation(
        trackerSheet, rowSheet,
        refDoc, nomClient, idGoogleDoc,
        processusTracker, emailValidateur, signatureId,
        emailDeposant, nomDeposant
      );
    } else {
      _logToSheet("INFO", `Décision : Refus pour le processus ${processusTracker} (Motif : ${motifRefus})`);
      _traiterRefus(
        trackerSheet, rowSheet,
        refDoc, processusTracker, emailValidateur, motifRefus,
        emailDeposant, nomDeposant
      );
    }
  } catch (err) {
    const errorMsg = `[CRITIQUE] Erreur dans surDecision : ${err.message}\n${err.stack}`;
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
// TRAITEMENT APPROBATION
// ================================================================
function _traiterApprobation(
  trackerSheet, rowSheet,
  refDoc, nomClient, idGoogleDoc,
  processus, emailValidateur, signatureId,
  emailDeposant, nomDeposant
) {
  const maintenant = new Date();

  // Écriture de la signature dans le Google Doc D'ABORD. Le Tracker n'est
  // marqué APPROUVÉ que si l'écriture réussit vraiment : avant ce fix, le
  // Tracker passait APPROUVÉ même quand l'écriture plantait (insertRows
  // inexistant / Action not allowed), ce qui faisait mentir le suivi (process
  // "validé" dans le Sheet mais jamais réellement signé dans le document).
  try {
    _insererSignatureDansTableau(idGoogleDoc, processus, emailValidateur, signatureId, maintenant);
    _logToSheet("INFO", `Signature écrite dans le document pour le processus : ${processus}`);

    trackerSheet.getRange(rowSheet, COL.STATUT + 1).setValue(STATUT.APPROUVE);
    trackerSheet.getRange(rowSheet, COL.DATE_VALIDATION + 1).setValue(maintenant);
  } catch (err) {
    _logToSheet("ERREUR", `Écriture de la signature échouée pour ${processus} — statut conservé EN_ATTENTE, à retraiter : ${err.message}`);
    return;
  }

  // Toutes les signatures sont nécessaires (un validateur = un vote) : on ne
  // finalise que si la totalité des lignes de ce document sont APPROUVÉ.
  const toutFinalise = _verifierValidationComplete(trackerSheet, refDoc);
  if (toutFinalise) {
    _logToSheet("INFO", `Tous les processus de ${refDoc} sont finalisés — génération du PDF.`);
    _genererPdfFinal(idGoogleDoc, refDoc, nomClient, emailDeposant, nomDeposant);
  }
}

/**
 * Ouvre le Google Doc et insère les informations de signature dans le
 * tableau HISTORIQUE DES RÉVISIONS (page 2 du document).
 */
function _insererSignatureDansTableau(idGoogleDoc, nomProcessus, emailValidateur, signatureId, dateValidation) {
  const doc  = DocumentApp.openById(idGoogleDoc);
  const body = doc.getBody();

  const tableHistorique = _trouverTableauHistorique(body);
  if (!tableHistorique) {
    throw new Error('Tableau HISTORIQUE DES RÉVISIONS introuvable dans le document.');
  }

  const nomProcessusNormalise = nomProcessus.trim().toUpperCase();
  const dateStr = Utilities.formatDate(dateValidation, Session.getScriptTimeZone(), 'dd/MM/yyyy');
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
        ligneEcrite = true;
        break;
      }
    }
  }

  if (!ligneEcrite) {
    const derniereIndex = _trouverDerniereIndexProcessus(tableHistorique, nomProcessusNormalise, numRows);
    if (derniereIndex >= 0) {
      // Table.insertRows() n'existe pas dans l'API Apps Script — c'était la
      // cause exacte de "insertRows is not a function" vu dans les logs du
      // 09/06. insertTableRow(index, ligneModele) est la méthode correcte :
      // elle clone la structure (nb de colonnes/style) d'une ligne existante.
      const ligneModele = tableHistorique.getRow(numRows - 1);
      const nouvelleLigne = tableHistorique.insertTableRow(derniereIndex + 1, ligneModele);
      nouvelleLigne.getCell(0).setText(nomProcessus);
      nouvelleLigne.getCell(1).setText(dateStr);
      nouvelleLigne.getCell(4).setText(texteValideur);
      ligneEcrite = true;
    }
  }

  doc.saveAndClose();
}

/**
 * Parcourt les tableaux du document pour trouver celui qui contient "HISTORIQUE".
 */
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

/**
 * Retourne l'index de la dernière ligne du tableau correspondant au processus donné.
 */
function _trouverDerniereIndexProcessus(table, nomProcessusNormalise, numRows) {
  let dernierIndex = -1;
  for (let i = 1; i < numRows; i++) {
    if (table.getCell(i, 0).getText().trim().toUpperCase() === nomProcessusNormalise) {
      dernierIndex = i;
    }
  }
  return dernierIndex;
}

// ================================================================
// TRAITEMENT REFUS
// ================================================================
function _traiterRefus(
  trackerSheet, rowSheet,
  refDoc, processus, emailValidateur, motifRefus,
  emailDeposant, nomDeposant
) {
  trackerSheet.getRange(rowSheet, COL.STATUT + 1).setValue(STATUT.REFUSE);
  trackerSheet.getRange(rowSheet, COL.DATE_VALIDATION + 1).setValue(new Date());

  MailApp.sendEmail({
    to: emailDeposant,
    subject: `[REFUS] ${refDoc} — Processus : ${processus}`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif; color:#1a1a1a; max-width:600px;">
        <p>Bonjour ${nomDeposant},</p>
        <p>Le processus <strong>${processus}</strong> de la fiche <strong>${refDoc}</strong> a été <strong style="color:#c0392b;">refusé</strong>.</p>
        <table style="border-collapse:collapse; width:100%; margin:16px 0;">
          <tr>
            <td style="padding:8px 12px; background:#f8f8f8; border:1px solid #ddd; font-weight:bold; width:160px;">Validateur</td>
            <td style="padding:8px 12px; border:1px solid #ddd;">${emailValidateur}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px; background:#f8f8f8; border:1px solid #ddd; font-weight:bold;">Motif</td>
            <td style="padding:8px 12px; border:1px solid #ddd;">${motifRefus || 'Non précisé'}</td>
          </tr>
        </table>
        <p>Veuillez corriger le document et soumettre une nouvelle révision.</p>
      </div>
    `,
  });
}

// ================================================================
// FINALISATION : VÉRIFICATION + GÉNÉRATION PDF
// ================================================================
function _verifierValidationComplete(trackerSheet, refDoc) {
  const donnees = trackerSheet.getDataRange().getValues();
  for (let i = 1; i < donnees.length; i++) {
    if (donnees[i][COL.REF_DOC] !== refDoc) continue;
    const statut = donnees[i][COL.STATUT];
    if (statut === STATUT.EN_ATTENTE) return false;
    if (statut === STATUT.REFUSE)     return false;
  }
  return true;
}

function _genererPdfFinal(idGoogleDoc, refDoc, nomClient, emailDeposant, nomDeposant) {
  const pdfBlob = DriveApp.getFileById(idGoogleDoc).getAs('application/pdf');
  pdfBlob.setName(`[VALIDÉ] ${refDoc}.pdf`);

  const dossierSylob = DriveApp.getFolderById(CFG.ID_DOSSIER_SYLOB);

  let dossierClient;
  const iterateur = dossierSylob.getFoldersByName(nomClient);
  if (iterateur.hasNext()) {
    dossierClient = iterateur.next();
  } else {
    dossierClient = dossierSylob.createFolder(nomClient);
  }

  const pdfCree = dossierClient.createFile(pdfBlob);
  _logToSheet("INFO", `PDF déposé avec succès : ${pdfCree.getUrl()}`);

  // Notification au déposant
  MailApp.sendEmail({
    to: emailDeposant,
    subject: `[VALIDÉ ✓] ${refDoc} — Tous les processus approuvés`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif; color:#1a1a1a; max-width:600px;">
        <p>Bonjour ${nomDeposant},</p>
        <p>🎉 Tous les processus de la fiche <strong>${refDoc}</strong> ont été approuvés.</p>
        <p>Le PDF final a été déposé dans le dossier client <strong>${nomClient}</strong>.</p>
        <p>
          <a href="${pdfCree.getUrl()}" style="display:inline-block; background:#1a56db; color:white; padding:8px 18px; text-decoration:none; border-radius:5px;">
            📄 Accéder au PDF validé
          </a>
        </p>
      </div>
    `,
  });

  // Mail à Sandrine seulement une fois que tout le monde a signé (décision du 04/06)
  const EMAIL_SANDRINE = "s.guillemin@tb-groupe.fr";
  MailApp.sendEmail({
    to: EMAIL_SANDRINE,
    subject: `[PROD VALIDÉ ✓] ${refDoc} — Prêt pour Sylob`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif; color:#1a1a1a; max-width:600px;">
        <p>Bonjour Sandrine,</p>
        <p>La validation de la fiche produit <strong>${refDoc}</strong> (Client : <strong>${nomClient}</strong>) est maintenant complète.</p>
        <p>Le document a été signé électroniquement par l'ensemble des décideurs concernés.</p>
        <p>Le PDF final a été automatiquement généré et classé dans le dossier client.</p>
        <div style="margin:20px 0;">
          <a href="${pdfCree.getUrl()}" style="display:inline-block; background:#22c55e; color:white; padding:10px 20px; text-decoration:none; border-radius:5px; font-weight:bold;">
            Accéder au PDF Finalisé
          </a>
        </div>
        <p style="font-size:12px; color:#888;">
          Ce document est prêt pour intégration dans Sylob.
        </p>
      </div>
    `,
  });
}
