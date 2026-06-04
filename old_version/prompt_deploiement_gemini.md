Tu es un expert Google Workspace (Apps Script, Google Forms, Google Drive). Je dois déployer un workflow "Sas de Validation" hybride pour automatiser le traitement de fiches produits.

Voici le cahier des charges et l'architecture exacte que je veux. Ne dévie pas de ce plan, donne-moi simplement des instructions claires pour copier-coller les éléments au bon endroit.

### L'Architecture "Sas de Validation"
Le système utilise 2 formulaires Google et 2 scripts Apps Script reliés aux feuilles de réponses.
- **Formulaire 1 ("Dépôt")** : L'auteur dépose un document Word (.docx) et renseigne les e-mails des validateurs. Le Script 1 renomme le fichier, gère les droits Drive sans envoyer de spam, et envoie un e-mail personnalisé avec les liens.
- **Formulaire 2 ("Décision")** : Le validateur vote ("J'approuve" ou "Je refuse"). Le Script 2 copie le fichier approuvé dans un dossier final avec la mention "[VALIDE]". Le scellement PDF légal sera fait manuellement ensuite via l'outil natif "Approbations" de Google.

---

### Tâche 1 : Préparation de l'environnement
1. Demande-moi de créer les dossiers Drive et donne-moi les instructions pour récupérer l'ID du dossier final "03 - Prêtes pour Sylob".
2. Demande-moi de créer les deux formulaires et de récupérer l'ID de la question "Référence" du Formulaire 2 pour le pré-remplissage.

---

### Tâche 2 : Script 1 (Routage et Dépôt)
Une fois que j'ai l'URL du formulaire 2 et l'ID de pré-remplissage, guide-moi pour attacher ce code à la feuille de calcul liée au **Formulaire 1** (et configurer le déclencheur `Lors de l'envoi`).

```javascript
const FORM_VALIDATION_URL = "URL_DU_FORM_2_ICI"; 

function surNouvelleDemande(e) {
  const reference = e.values[1];
  const urlFichier = e.values[2];
  const stringEmails = e.values[3]; 
  const validateurs = stringEmails.split(',').map(function(email) { return email.trim(); });
  
  const idFichier = getIdFichierDepuisUrl(urlFichier);
  if (idFichier) {
    try { 
      const fichier = DriveApp.getFileById(idFichier);
      fichier.setName(reference);
      fichier.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
    } catch(err) { console.log("Erreur : " + err); }
  }
  
  validateurs.forEach(function(email) {
    envoyerEmailDemande(email, reference, urlFichier);
  });
}

function envoyerEmailDemande(emailUtilisateur, reference, urlFichier) {
  const sujet = "[ACTION REQUISE] Validation de Fiche Produit : " + reference;
  const lienApprobation = FORM_VALIDATION_URL + "?usp=pp_url&entry.ID_QUESTION=" + encodeURIComponent(reference); 
  
  const contenuHtml = "<h2>Bonjour,</h2>" +
    "<p>Une demande de validation est en attente pour la fiche : <strong>" + reference + "</strong>.</p>" +
    "<p>👉 <a href='" + urlFichier + "'>Etape 1 : Consulter le document</a></p>" +
    "<br><a href='" + lienApprobation + "' style='padding:10px; background-color:#28a745; color:white;'>✅ Etape 2 : Rendre ma decision</a>";
  
  MailApp.sendEmail({ to: emailUtilisateur, subject: sujet, htmlBody: contenuHtml });
}

function getIdFichierDepuisUrl(url) {
  if (!url) return null;
  var id = url.match(/id=([^&]+)/);
  if (id) return id[1];
  var ds = url.match(/d\/([^\/]+)/);
  if (ds) return ds[1];
  return null;
}
```

---

### Tâche 3 : Script 2 (Approbation et Classement)
Ensuite, guide-moi pour attacher ce second code à la feuille de calcul liée au **Formulaire 2** (avec le même type de déclencheur).

```javascript
const ID_DOSSIER_SYLOB = "ID_DOSSIER_FINAL_ICI";

function surDecision(e) {
  const emailValidateur = e.values[1]; 
  const decision = e.values[2]; 
  const motif = e.values[3]; 
  const reference = e.values[4]; 
  const emailCreateur = "email.auteur@entreprise.com"; 
  
  if (decision === "J'approuve") {
    const fichiers = DriveApp.searchFiles("title contains '" + reference + "'");
    if (fichiers.hasNext()) {
      const docAValider = fichiers.next();
      const dossierSylob = DriveApp.getFolderById(ID_DOSSIER_SYLOB);
      
      try {
        // Tentative d'ouverture si c'est bien un Google Doc
        const docApp = DocumentApp.openById(docAValider.getId());
        const body = docApp.getBody();
        
        body.appendHorizontalRule();
        body.appendParagraph("✅ VALIDATION ÉLECTRONIQUE").setHeading(DocumentApp.ParagraphHeading.HEADING3);
        body.appendParagraph("Signataire : " + emailValidateur);
        body.appendParagraph("Date : " + new Date().toLocaleString("fr-FR"));
        body.appendParagraph("Statut : APPROUVÉ");
        docApp.saveAndClose();
        
        // Conversion en PDF
        const pdfBlob = docAValider.getAs('application/pdf');
        pdfBlob.setName("[VALIDE par " + emailValidateur + "] " + reference + ".pdf");
        dossierSylob.createFile(pdfBlob);
      } catch(err) {
        // Fallback si c'est un vieux .docx (on fait juste une copie)
        docAValider.makeCopy("[VALIDE par " + emailValidateur + "] " + reference, dossierSylob);
      }
      
      MailApp.sendEmail({
        to: emailCreateur,
        subject: "[APPROUVE] Fiche " + reference,
        htmlBody: "Excellente nouvelle !<br>L'utilisateur <strong>" + emailValidateur + "</strong> a approuve la fiche " + reference + ".<br>Le PDF avec signature a ete genere dans le dossier 03."
      });
    }
  } else {
    MailApp.sendEmail({
      to: emailCreateur,
      subject: "[REFUSE] Fiche " + reference,
      htmlBody: "La fiche a ete refusee par <strong>" + emailValidateur + "</strong>.<br>Motif : " + motif
    });
  }
}
```

Pose-moi les questions de l'Étape 1 pour démarrer.
