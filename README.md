# Care Plan Builder · Bakım Planı Oluşturucu

*[English](#english) · [Türkçe](#türkçe)*

---

## English

A free, private and offline planning tool for households that care for someone — a baby, a child, an older adult, a partner in recovery, or anyone else who needs support. Set out the roles, recurring duties and household routines; the tool builds a weekly plan, reveals coverage gaps and shows how the estimated workload is distributed.

**Try it:** download [`care-plan-builder.html`](care-plan-builder.html) and open it in your browser. The entire application is contained in that one file.

### Why it exists

This tool grew out of a real household: a grandmother cared for at home by a family care manager, a live-in caregiver, a helper who comes twice a week, a family medication lead and a visiting physiotherapist. The **Show the example plan** button presents that system without personal information. It includes the daily care rhythm, household work, meal and shopping planning, measurements, coverage arrangements, budget management and coordination with helper agencies.

Many caregiving households depend on a similar invisible system. Care Plan Builder makes it visible so responsibilities can be shared, discussed and made fairer.

### What it does

- **Flexible starting templates** — choose from ten care situations, including a baby, child, older adult, dementia care, recovery, disability, palliative care and mental-health support. Suggested roles and duties are fully editable and optional.
- **Calm staged opening** — the first screen asks the user to choose a care situation or explore the example. The complete builder and top actions appear only after that choice.
- **Collapsible sections** — every major input and result area can be shown or hidden independently. Core planning sections open first, optional modules stay compact until needed, and PDF output always includes the complete plan.
- **Roles and duties** — record who owns each duty, when it happens, typical time, responsibility level, type of work and who provides cover.
- **Weekly care plan** — combines the daily rhythm, scheduled duties and ongoing work into an easy-to-read week.
- **Coverage gaps** — identifies duties whose owner is away and has no cover. The message links back to the Duties section so coverage can be added directly.
- **Where the weight falls** — estimates each role's share using typical time and responsibility level. When an owner is away, that occurrence moves to the covering role; work without cover remains visibly unassigned. The chart uses a different colour for each role.
- **Shopping guide and current list** — maintain a reusable guide of household items using five neutral categories, your own categories, or optional care-specific category prompts. Add, edit, move or remove items and mark them as in stock, running low or needed to form the current shopping list automatically.
- **Meal library and weekly meal planner** — begin with an empty personal library or use optional prompts that name familiar meal slots without recommending foods or a diet. Add and edit the household's own meals, ingredients and notes, plan breakfast, lunch and dinner for the week, and add a meal's ingredients to the shopping list.
- **Custom measurement tables** — add as many separate tables as needed using blood-glucose, blood-pressure, oxygen-saturation or the explicit **Add a Custom Table…** option. Every table title, column, row, date and value remains editable. The example includes only a blank design, with no readings or personal information.
- **PDF and backup files** — download or print the complete plan as a PDF. An optional JSON backup can be saved to your own device and reopened later.
- **English and Turkish** — switch languages at any point. Built-in content and recognised manual terms from the embedded offline glossary translate on every switch; wording that is not in the glossary remains exactly as the household entered it.

### Privacy

Caregiving is private. This tool respects that by design:

- **No application server, account or analytics.** After the page loads, the app makes no network requests; plan data remains on your device and even the fonts are embedded in the HTML.
- **No automatic storage.** The plan exists only in the open page and disappears when the tab is closed.
- **You control every copy.** A file is created only when you deliberately download a PDF or backup. Nothing is uploaded.

### It is not a medical tool

Care Plan Builder records schedules and information that the household has already decided to track. It does not interpret measurements, recommend ranges, decide a dose or treatment, or determine whether something is safe. Keep doctors and pharmacists involved in medical decisions.

---

## Türkçe

Birine bakım veren haneler için ücretsiz, özel ve çevrimdışı bir planlama aracı — bir bebek, çocuk, yaşlı bir yakın, iyileşme sürecindeki bir eş veya desteğe ihtiyaç duyan herhangi biri. Rolleri, tekrarlanan görevleri ve ev düzenini yazın; araç haftalık planı oluştursun, açıkta kalan görevleri ve tahmini iş yükünün nasıl dağıldığını göstersin.

**Denemek için:** [`care-plan-builder.html`](care-plan-builder.html) dosyasını indirin ve tarayıcınızda açın. Uygulamanın tamamı bu tek dosyanın içindedir.

### Neden var

Bu araç gerçek bir haneden doğdu: evde bakılan bir büyükanne; ailedeki bir bakım sorumlusu, yatılı bir bakıcı, haftada iki gün gelen bir yardımcı, ilaçları düzenleyen bir aile üyesi ve eve gelen bir fizyoterapist. **Örnek planı göster** düğmesi bu sistemi kişisel bilgiler olmadan sunar. Günlük bakım düzenini, ev işlerini, yemek ve alışveriş planlamasını, ölçümleri, devralma düzenini, bütçe yönetimini ve yardımcılar için kurumlarla koordinasyonu içerir.

Bakım veren birçok hane benzer ve çoğunlukla görünmez bir sistemle işler. Bakım Planı Oluşturucu, sorumlulukların paylaşılabilmesi, konuşulabilmesi ve daha adil hale getirilebilmesi için bu sistemi görünür kılar.

### Neler yapar

- **Esnek başlangıç şablonları** — bebek, çocuk, yaşlı bir yakın, demans bakımı, iyileşme, engellilik, palyatif bakım ve ruh sağlığı desteği dahil on bakım durumundan birini seçin. Önerilen roller ve görevler tamamen düzenlenebilir ve isteğe bağlıdır.
- **Sakin ve aşamalı başlangıç** — ilk ekran kullanıcıdan bir bakım durumu seçmesini veya örneği incelemesini ister. Planlayıcının tamamı ve üst işlemler yalnızca bu seçimden sonra görünür.
- **Açılıp kapanabilen bölümler** — tüm ana giriş ve sonuç alanları birbirinden bağımsız olarak gösterilip gizlenebilir. Temel planlama bölümleri önce açılır, isteğe bağlı modüller ihtiyaç duyulana kadar kapalı kalır ve PDF çıktısı her zaman planın tamamını içerir.
- **Roller ve görevler** — her görevin sorumlusunu, zamanını, tipik süresini, sorumluluk düzeyini, iş türünü ve gerektiğinde kimin devralacağını kaydedin.
- **Haftalık bakım planı** — günlük düzeni, belirli günlerdeki görevleri ve devam eden işleri okunması kolay bir haftada birleştirir.
- **Açıkta kalan görevler** — sorumlusu izinli olduğu halde devralanı olmayan görevleri belirler. Mesaj, devralacak kişinin doğrudan eklenebilmesi için Görevler bölümüne yönlendirir.
- **Yük kimin üzerinde** — her rolün payını tipik süre ve sorumluluk düzeyini birlikte kullanarak tahmin eder. Sorumlu yoksa o iş devralan role aktarılır; devralanı olmayan işler görünür biçimde atanmamış kalır. Grafikte her rol farklı bir renkle gösterilir.
- **Alışveriş rehberi ve güncel liste** — beş genel kategori, kendi kategorileriniz veya bakım türüne özel isteğe bağlı kategori fikirleriyle hane ürünleri için tekrar kullanılabilen bir rehber oluşturun. Ürünleri ekleyin, düzenleyin, başka kategoriye taşıyın veya kaldırın; stokta, azaldı ya da gerekli olarak işaretleyerek güncel listeyi otomatik oluşturun.
- **Yemek kütüphanesi ve haftalık yemek planı** — boş ve kişisel bir kütüphaneyle başlayın veya yiyecek ya da beslenme düzeni önermeden alışılmış öğünleri adlandıran isteğe bağlı fikirlerden yararlanın. Hanenin kendi yemeklerini, malzemelerini ve notlarını ekleyip düzenleyin; haftayı planlayın ve bir yemeğin malzemelerini alışveriş listesine ekleyin.
- **Özel ölçüm tabloları** — kan şekeri, tansiyon, oksijen satürasyonu veya açıkça görünen **Özel Tablo Ekle…** seçeneğiyle ihtiyaç duyduğunuz kadar ayrı tablo ekleyin. Her tablonun başlığı, sütunları, satırları, tarihleri ve değerleri düzenlenebilir kalır. Örnek planda hiçbir değer veya kişisel bilgi bulunmayan boş bir tasarım yer alır.
- **PDF ve yedek dosyaları** — planın tamamını PDF olarak indirin veya yazdırın. İsteğe bağlı JSON yedeğini kendi cihazınıza kaydedip daha sonra yeniden açabilirsiniz.
- **İngilizce ve Türkçe** — dili istediğiniz anda değiştirebilirsiniz. Hazır içerik ve gömülü çevrimdışı sözlükte tanınan elle girilmiş terimler her geçişte çevrilir; sözlükte bulunmayan ifadeler hanenin yazdığı biçimde korunur.

### Gizlilik

Bakım mahrem bir konudur. Bu araç bunu tasarımı gereği gözetir:

- **Uygulama sunucusu, hesap veya analitik yoktur.** Sayfa yüklendikten sonra uygulama hiçbir ağ isteği yapmaz; plan verileri cihazınızda kalır ve yazı tipleri bile HTML dosyasına gömülüdür.
- **Otomatik kayıt yoktur.** Plan yalnızca açık sayfada bulunur ve sekme kapatıldığında kaybolur.
- **Her kopya sizin kontrolünüzdedir.** Yalnızca siz PDF veya yedek indirmeyi seçtiğinizde bir dosya oluşturulur. Hiçbir şey yüklenmez.

### Tıbbi bir araç değildir

Bakım Planı Oluşturucu, hanenin zaten takip etmeye karar verdiği programları ve bilgileri kaydeder. Ölçümleri yorumlamaz, aralık önermez, doz veya tedavi belirlemez ve bir şeyin güvenli olup olmadığına karar vermez. Tıbbi kararlarda doktorlar ve eczacılar devrede kalmalıdır.

---

## Creator · Oluşturan

Created with love for caregivers everywhere.  
Her yerdeki bakım verenler için sevgiyle oluşturulmuştur.

© 2026 Dilara Murathanoglu

---

## For developers · Geliştiriciler için

The complete app is one dependency-free HTML file: no build step, framework or package manager is required. Plan data stays in page memory unless the user explicitly downloads a PDF or JSON backup.

The embedded fonts — [Source Serif 4](https://github.com/adobe-fonts/source-serif), [Public Sans](https://github.com/uswds/public-sans) and [IBM Plex Mono](https://github.com/IBM/plex) — are licensed under the [SIL Open Font License 1.1](fonts/).

## License · Lisans

Code: [MIT](LICENSE). Fonts: [SIL OFL 1.1](fonts/).
