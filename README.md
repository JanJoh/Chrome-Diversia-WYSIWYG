# Diversia WYSIWYG

Ett webbläsartillägg för **Chrome, Firefox och Safari** (Mac, iPhone och iPad) som ger **visuell redigering (WYSIWYG)** på [Diversia](https://diversia.social/). Du formaterar dagboksinlägg, presentationer och forumsinlägg med knappar i stället för att skriva `<font size=4 color=#C62828>` för hand.

*Diversia hette tidigare Darkside.se.*

![Redigeraren på en Diversia-liknande sida](docs/extension.png)

> **In English:** a browser extension that adds visual (WYSIWYG) editing to Diversia's text markup. See [README.en.md](README.en.md).

## Innehåll

- [Vad tillägget gör](#vad-tillägget-gör)
- [Bildväljaren](#bildväljaren)
- [Medlemsväljaren](#medlemsväljaren)
- [Installation](#installation)
  - [Chrome (och Edge, Brave…)](#chrome-och-edge-brave)
  - [Firefox](#firefox)
  - [Safari (Mac)](#safari-mac)
  - [Bygga själv](#bygga-själv)
- [På mobil och surfplatta](#på-mobil-och-surfplatta)
- [Markup som stöds](#markup-som-stöds)
- [Versionskontroll](#versionskontroll)
- [Integritet](#integritet)
- [Utveckling](#utveckling)
  - [Kända begränsningar och att göra](#kända-begränsningar-och-att-göra)
- [Licens](#licens)

## Vad tillägget gör

- Lägger till en **"Visuell redigering: PÅ/AV"**-knapp ovanför varje större textruta på Diversia.
- Visar texten **som den kommer att se ut**, med sajtens eget typsnitt och färger, och en verktygsrad för:
  - **Text:** **F** *K* <u>U</u>, textstorlek 1–6, färger (en palett plus en fri färgväljare).
  - **Layout:** centrering, citat (`<blockquote>`), ruta (`<box>`), avdelare (`<hr>`).
  - **Länkar och media:** länkar, bilder från ditt galleri eller valfri adress, och medlemslänkar från din vänlista (se nedan).
  - **Inbäddningar:** Spotify (klistra in en `open.spotify.com`-länk så görs den om till den URI som Diversia vill ha), YouTube/Vimeo och SoundCloud.
  - **Städning:** rensa formatering, och ett **Källkod**-läge för att redigera råmarkupen direkt.
- **Behåller den ursprungliga textrutan** och uppdaterar den medan du skriver. Sidans eget formulär, utkast och "Spara"-knapp fungerar precis som förut. Tillägget skickar aldrig in något självt.
- **Städar inklistrad text.** Innehåll från Word, Google Docs eller webbsidor reduceras till det Diversia stöder: rubriker blir stor fet text, listor blir rader, och skript och stilmallar tas bort. Inklistrad Diversia-kod känns igen och visas formaterad.
- **Rör inte din markup.** Att slå på och av redigeraren ändrar inte ett enda tecken i din befintliga text. Felnästlade taggar som `<b><i>x</b></i>` repareras till rätt ordning (sist öppnad stängs först), och okända taggar syns exakt som sajten visar dem.
- **Kommer ihåg ditt val.** Lämnar du visuell redigering påslagen öppnas den så nästa gång.

Tillägget körs automatiskt på `diversia.social` och `diversia.se`. På andra sidor klickar du på ikonen i verktygsraden för att lägga till redigeraren bara i den fliken.

## Bildväljaren

![Bildväljaren](docs/image-picker.png)

Klicka på **Bild** för att öppna bildväljaren. Den har två flikar:

- **Mitt galleri** läser din gallerisida på sajten och visar först dina **album**, med omslagsbild och namn. Klicka på ett album för att se bilderna i det, och på **← Alla album** för att komma tillbaka.
  - **Den håller sig i ditt galleri.** Sajtens genvägar till allas bilder ("100.000-tals bilder", "Persongalleriet") ser ut precis som albumlänkar men följs aldrig, och inte heller profil, gästbok, dagbok eller vänlista, som ligger i samma mapp och bär samma medlemsnummer.
  - **Bara det du klickar på hämtas.** Att öppna väljaren läser en sida: din gallerisida, som redan innehåller albumens namn och omslag. Att öppna ett album läser en sida till. Ingenting hämtas i förväg och ingenting följs rekursivt — sajten har skydd mot skrapning, och bara ett klick gör en förfrågan.
  - Bilder som ligger löst på gallerisidan, utanför albumen, visas direkt under albumen.
  - Miniatyrer som ritas som bakgrundsbild, vilket Diversia gör, läses lika bra som vanliga `<img>`.
  - **Den visar bara bilder.** Sajtens inredning sorteras bort: smileys och reaktionsemojier, stjärnan och den svarta rutan som ligger över bilderna, platshållaren för en bild som inte visas, bannrar, ikoner — och profilbilderna på dem som kommenterat, som annars hamnar bland dina egna bilder. **Du får alltid bilden i full storlek.** Diversia signerar sina bildadresser, så en miniatyr går inte att skriva om till en större version: `a=2` är 250-pixelskopian och signaturen täcker den parametern. Den riktiga adressen finns bara på bildens egen sida, som läses en gång, när du klickar på bilden, och kommer ihåg efteråt. Det spelar alltså ingen roll om bilden visades som albumomslag eller inne i ett album — det som infogas är detsamma.
  - **Adressen hittas oftast av sig själv.** Sajtens egen meny länkar till ditt galleri, och en personlig sida bär ditt medlemsnummer där den gemensamma inte gör det (`/pic/?id=250` mot `/pic/`). Den länken väljs direkt, så galleriet är redan inläst när väljaren öppnas.
  - Hittas ingen sådan länk klistrar du in adressen första gången, eller klickar på ett av förslagen från menyn. Bara dina egna sidor föreslås, aldrig sajtens genvägar till allas bilder. När galleriet är inläst försvinner adressraden; **Ändra galleriadress** tar fram den igen.
- **Bildadress (URL)** tar emot vilken bildlänk som helst och kontrollerar den först:
  - avvisar filer på din egen dator (`data:`, `blob:`, `file:`) och sådant som inte är webbadresser
  - byter `http://` mot `https://`, eftersom sajten kräver det
  - rättar vanliga "sida i stället för bild"-länkar (imgur-sidor, Dropbox `?dl=0`) och varnar för Google Drive/Foton
  - laddar bilden på riktigt, och kan därför berätta om adressen verkligen är en bild och hur stor den är, med en ledtråd när det är en webbsida i stället
  - föreslår en mindre storlek för väldigt breda bilder

  Om kontrollen misslyckas men du vet att adressen stämmer, till exempel på en sajt som blockerar förhandsvisningar, kan du ändå välja **Infoga ändå**.

Båda flikarna delar enkla inställningar för **storlek** (original, 25/50/75/100 %, eller en bredd i pixlar), **placering** (ingen, vänster eller höger med textflöde, centrerad) och **ram**, med förhandsvisning i realtid.

**Klicka på en bild** i redigeraren för att ändra inställningarna i efterhand eller ta bort bilden.

## Medlemsväljaren

![Medlemsväljaren](docs/member-picker.png)

Klicka på **@** för att öppna medlemsväljaren.

- **Vänner:** den läser din vänlistesida, med samma automatik och samma adress-eller-förslag-upplägg som galleriet, och visar en sökbar lista sorterad på svenskt vis (Å Ä Ö sist). Skriv en del av ett namn och tryck Enter för att infoga det.
- **Nummer:** den andra fliken tar ett medlemsnummer direkt.
- **Markerad text:** hade du markerat text blir den texten länken. Annars används medlemmens namn.

Båda väljarna läser sidor enbart från sajten du är på, som den inloggade du, och kontaktar aldrig något annat.

> **Kontrollera en gång:** medlemsväljaren läser numret ur profillänkar (`…?id=12345`, `/medlem/12345`…). På de flesta sajter är det samma nummer som medlemsnumret på presentationssidan, men kontrollera med en vän första gången.

## Installation

Tillägget finns inte i någon webbläsarbutik, så du installerar det själv från en zip-fil. Det tar ungefär en minut, och du behöver inte kunna något om kod.

**1. Hämta filen.** Öppna [senaste versionen](https://github.com/JanJoh/Chrome-Diversia-WYSIWYG/releases/latest) och ladda ner den som passar din webbläsare:

| Fil att ladda ner | För |
|---|---|
| `diversia-wysiwyg-chrome-*.zip` | Chrome, Edge, Brave, Opera, Vivaldi |
| `diversia-wysiwyg-firefox-*.zip` | Firefox på dator och Android |
| `diversia-wysiwyg-safari-*.zip` | Safari på macOS, iOS och iPadOS |

**2. Packa upp den.** Dubbelklicka på zip-filen. Du får en mapp — det är den som webbläsaren ska läsa in, inte zip-filen.

**3. Läs in mappen.** Följ stegen för din webbläsare nedan.

### Chrome (och Edge, Brave…)

1. Öppna `chrome://extensions` i adressfältet.
2. Slå på **Utvecklarläge** uppe till höger.
3. Klicka på **Läs in uppackat** och välj mappen du packade upp.

Tillägget blir kvar tills du tar bort det. Gå till Diversia, så sitter **Visuell redigering** ovanför textrutorna.

### Firefox

1. Öppna `about:debugging#/runtime/this-firefox`.
2. Klicka på **Läs in temporärt tillägg…** och välj filen `manifest.json` inuti mappen.

Det ligger kvar tills Firefox startas om, och måste läsas in igen efter det. Det är Firefox som fungerar så med tillägg som inte kommer från deras butik.

**Behörigheter:** i Firefox bestämmer du själv över sidåtkomst. Om knappen inte dyker upp på Diversia klickar du på Tillägg (pusselbiten) och tillåter tillägget på den sajten.

### Safari (Mac)

Kräver Safari 26 eller senare.

1. Gå till Safari → Inställningar → **Utvecklare**. Syns den inte, slå först på *Visa funktioner för webbutvecklare* under Avancerat.
2. Klicka på **Lägg till temporärt tillägg…** och välj mappen du packade upp.

Det laddas ur när Safari avslutas, så lägg till det igen efter omstart.

**Behörigheter:** Safari ber dig tillåta tillägget per webbplats. Välj *Tillåt alltid på den här webbplatsen* för Diversia.

**På iPhone och iPad** går det inte att läsa in ett tillägg för hand. Safari-tillägg måste komma från App Store, vilket kräver Apple Developer Program — se [Bygga själv](#bygga-själv) nedan.

### Bygga själv

Bara om du vill bygga från källkoden i stället för att hämta en färdig fil:

```bash
npm install
npm run build
```

Det skapar `dist/chrome`, `dist/firefox` och `dist/safari` att läsa in, plus en zip per webbläsare. Roten i förrådet är också ett giltigt Chrome-tillägg, så den går att läsa in direkt.

**Att publicera det vidare:** Chrome Web Store har en engångsavgift för utvecklare, Edge Add-ons är gratis. [addons.mozilla.org](https://addons.mozilla.org/developers/) är gratis — välj *On your own* för en signerad fil som bara du delar, eller lista det publikt. Safari distribueras via App Store och kräver Apple Developer Program, som har en årsavgift: ladda upp Safari-zipen via **App Store Connect**, som paketerar webbtillägg utan Mac eller Xcode, eller kör `xcrun safari-web-extension-converter dist/safari` på en Mac med Xcode och bygg appen som skapas. Den vägen täcker macOS, iOS och iPadOS.

## På mobil och surfplatta

Redigeraren anpassar sig när den är smal:

- De mest använda verktygen (**F K U**, storlek, färg, **Bild**, **@**, **Länk**, **Källkod**) syns hela tiden, och resten fälls in under **⋯**.
- Knapparna är gjorda för fingrar.
- Dialogrutor fyller skärmen.
- Textfälten utlöser inte iPhones automatiska zoom.
- Ett tryck på en verktygsknapp behåller din markering, även om trycket flyttade fokus.

<img src="docs/mobile.png" width="300" alt="Redigeraren på en mobil">

## Markup som stöds

| Diversia | I redigeraren |
|---|---|
| `<b>` `<i>` `<u>` | Fet, kursiv, understruken |
| `<font size=1-6 color=#RRGGBB lineheight=N>` | Storlek och färg |
| `<center>`, `<p align=…>` | Centrerat eller justerat block |
| `<blockquote>` | Indraget citat |
| `<box align bgcolor padding border bordercolor>` | Ruta med bakgrund och ram |
| `<hr size color width>` | Avdelare |
| `<br>`, radbrytningar | Radbrytningar (Enter ger en radbrytning, inte ett nytt block) |
| `<pre>` | Förformaterad text |
| `<a href=https://…>` | Länk (endast https, som på sajten) |
| `<img src=https://… width height align border>` | Bild |
| `<m 12345>…</m>`, `<alster 123>…</alster>` | Medlems- och alsterlänkar (prickad understrykning) |
| `<video URL>`, `<soundcloud URL>`, `<spotify URI>` | Platshållarblock för inbäddningar |
| `&lt;` | Ett bokstavligt `<` |

Taggattribut som du inte rört behålls exakt som de skrevs, inklusive ordningen.

## Versionskontroll

Tillägget frågar GitHub en gång per dygn vilken den senaste utgåvan är. Finns det en nyare version dyker en länk upp bredvid **Visuell redigering**-knappen: *Version 0.4.0 finns att hämta*. Eftersom ett klick på ikonen lägger till redigeraren finns ingen panel att visa notisen i, så den hamnar där du ändå tittar.

Kontrollen går att stänga av: högerklicka på ikonen och välj **Alternativ** (eller gå via `chrome://extensions`), och avmarkera **Sök efter nya versioner**. Där finns också **Sök nu**, som frågar direkt i stället för att vänta på nästa gång.

Misslyckas en kontroll behålls det tidigare svaret, men ett nytt försök görs inom en timme i stället för först nästa dygn. Annars hade en kontroll gjord innan projektets första utgåva ens fanns tystat notisen ett helt dygn efteråt.

Det är tilläggets enda anrop till något annat än sidan du är på. Inga kakor följer med (`credentials: "omit"`), inga egna rubriker sätts, och ingenting om dig eller din text skickas. Svaret sparas lokalt i ett dygn, så tjugo öppna Diversia-flikar ger ändå på sin höjd ett anrop. Ingen ny behörighet begärs för det, eftersom GitHub tillåter läsning från andra ursprung.

## Integritet

Tillägget samlar inte in, skickar eller lagrar någon text. Det som sparas lokalt i webbläsaren är ditt på/av-val, om versionskontrollen är påslagen, och det senaste svaret från den. Den enda utgående förfrågan är versionskontrollen ovan. Tillägget använder följande behörigheter:

- **`storage`** för de valen.
- **`activeTab` + `scripting`** så att ett klick på ikonen kan lägga till redigeraren i fliken du är i.
- **Automatisk körning** endast på Diversia-domänerna som listas ovan.

Firefox-paketen deklarerar dessutom att ingen data samlas in (`data_collection_permissions: none`).

## Utveckling

```bash
npm install                      # installerar Playwright (endast för tester)
npx playwright install chromium  # en gång
npm test                         # enhetstester för konverteraren + end-to-end-tester
npm run screenshots              # uppdaterar docs/*.png
npm run demo                     # demo på http://localhost:8080/demo/index.html
npm run build                    # dist/{chrome,firefox,safari} + zip-filer
```

Upplägget är medvetet litet, utan byggsteg och utan beroenden vid körning:

| Fil | Vad den gör |
|---|---|
| `src/diversia.js` | Tolkar markup till redigerar-DOM (`parse`) och gör redigerar- eller inklistrad DOM till markup igen (`serialize`, vitlistbaserad) |
| `src/editor.js` | Verktygsraden och den contenteditable-redigerare som är kopplad till en `<textarea>` |
| `src/pickers.js` | Bildväljaren (galleriskanning, URL-kontroller, storlek/placering/ram) och medlemsväljaren (vänlistan) |
| `src/content.js` | Hittar textrutor och lägger till knappen |
| `src/background.js` | Verktygsikonen: injicerar redigeraren på valfri sida, och gör versionskontrollens anrop |
| `src/version.js` | Jämförelse av versionsnummer och adresserna kontrollen använder, delat av bakgrundsskriptet och inställningssidan |
| `src/options.html`, `src/options.js` | Inställningssidan: på/av för versionskontrollen och vad den senast hittade |
| `scripts/build.mjs` | Manifest och paket per webbläsare |
| `test/converter.test.mjs` | Tester för rundgång och sanering, körda i riktig Chromium, inklusive hela inlägg i `test/samples/` |
| `test/e2e.test.mjs` | Demosidan, plus det inlästa tillägget på en låtsas-Diversia-sida (inklusive formulärpostning) |
| `test/pickers.test.mjs` | Galleriskanning, bildinställningar och redigering, URL-kontroller, vänlista, sökning och medlemsnummer |
| `test/mobile.test.mjs` | Användning på mobilstorlek med pekskärm: infälld verktygsrad, tryck som behåller markeringen, dialoger i helskärm |
| `test/build.test.mjs` | Att de tre paketen är kompletta och har rätt manifestform per webbläsare |
| `test/version.test.mjs` | Att bara en verkligt nyare utgåva räknas som nyare |

### Kända begränsningar och att göra

- **Återgivningen är ungefärlig.** Redigeraren använder HTML:s standardstorlekar 1–6 och utgår från att sajten visar radbrytningar som de skrivs. Båda är sajtens dokumenterade beteende, men kontrollera det första riktiga inlägget.
- **Inbäddningar visas som platshållare,** inte som spelare.
- **URL-kontrollen laddar bilden inuti sidan,** så en sajt med strikt bildpolicy kan få en fungerande adress att underkännas. "Infoga ändå" finns alltid.
- **Rutattribut går inte att redigera än.** En ny ruta får en standardram. Använd Källkod-läget för att justera den.
- **Små fält** som "personliga fakta" stöder inte alla taggar, och knappen läggs bara till på större textrutor.
- **Firefox och Safari byggs och paketeras men är ännu inte testade i de webbläsarna.** De automatiska testerna körs i Chromium. Koden använder bara API:er som alla tre stöder, inklusive namnrymderna `browser`/`chrome`.
- **`execCommand`** är föråldrat men fortfarande det mest pålitliga redigerings-API:et över Chrome-versioner. Redigeraren är skriven så att den senare kan byta redigeringsmotor.

## Licens

MIT
