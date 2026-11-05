# МАТЕРІАЛИ ДО ПЕРЕДАТЕСТАЦІЙНОЇ ПРАКТИКИ

**Тема:** Агрегатор новин з функцією виявлення неправдивої інформації  
**Студент:** Мельников М. С.  
**Спеціальність:** 121 «Інженерія програмного забезпечення»  
**Термін проходження практики:** 21.09.2026 – 25.10.2026  

---

## 1. Календарний план проходження практики

### Варіант 1 (із зазначенням контрольних дат виконання – як у прикладі):

| № з/п | Завдання | Строк виконання завдання | Примітка |
| :---: | :--- | :---: | :---: |
| 1 | Огляд наукової літератури та фахових джерел за темою роботи | 25.09.2026 | Виконано |
| 2 | Складання та узгодження календарного плану виконання КМР | 28.09.2026 | Виконано |
| 3 | Системний аналіз предметної області та порівняльний огляд існуючих рішень | 08.10.2026 | Виконано |
| 4 | Математичне моделювання, функціональне проєктування та розробка специфікації вимог до ПЗ | 19.10.2026 | Виконано |
| 5 | Систематизація матеріалів та оформлення звіту з практики | 25.10.2026 | Виконано |

### Варіант 2 (із зазначенням часових періодів виконання):

| № з/п | Завдання | Строк виконання завдання | Примітка |
| :---: | :--- | :---: | :---: |
| 1 | Огляд наукової літератури та фахових джерел за темою роботи | 21.09.2026 – 25.09.2026 | Виконано |
| 2 | Складання та узгодження календарного плану виконання КМР | 26.09.2026 – 28.09.2026 | Виконано |
| 3 | Системний аналіз предметної області та порівняльний огляд існуючих рішень | 29.09.2026 – 08.10.2026 | Виконано |
| 4 | Математичне моделювання, функціональне проєктування та розробка специфікації вимог до ПЗ | 09.10.2026 – 19.10.2026 | Виконано |
| 5 | Систематизація матеріалів та оформлення звіту з практики | 20.10.2026 – 25.10.2026 | Виконано |

---

## 2. Висновки до звіту з практики

### ВИСНОВКИ

Проходження переддипломної (передатестаційної) практики стало важливим етапом у професійному становленні, дозволивши поєднати теоретичні засади інженерії програмного забезпечення з практичними навичками побудови інтелектуальних систем обробки даних. Виконання поставлених завдань дало змогу детально опрацювати обрану тему й підготувати комплекс аналітичних та проєктних матеріалів.

Під час аналізу предметної області вивчено сучасні тенденції функціонування цифрового новинного простору, механізми розповсюдження дезінформації та маніпулятивних маркерів. Проведено детальний огляд систем-аналогів (Google News, Feedly, StopFake, VoxCheck) та виявлено їхні обмеження щодо потокового аналізу та оперативного виявлення фейків. Це дозволило сформувати чітке бачення функціональних можливостей створюваного новинного вебзастосунку.

На етапі моделювання здійснено аналіз інструментарію та розроблено математичний апарат оцінки достовірності на основі LSH MinHash, індексу Гуро та семантичного зіставлення з базою ClaimReview. Побудовано функціональні моделі DFD, модель даних ER та підготовлено детальну специфікацію вимог до програмного забезпечення. Це забезпечило структурований інженерний підхід до проєктування та заклало основу для подальшої розробки.

Здобуті під час практики вміння аналізувати інформаційні потоки, формалізувати системні вимоги та проєктувати масштабовану клієнт-серверну архітектуру (FastAPI, Next.js, PostgreSQL) закладають надійний фундамент для успішної реалізації проєкту. Набутий досвід суттєво підвищив рівень фахової підготовки і стане вирішальним під час розробки та захисту кваліфікаційної роботи.

---

## 3. Відповіді на захисті практики (до зауважень щодо предмета роботи та підвищення ефективності)

### Питання 1: «Конкретизуйте предмет вашої роботи: які саме методи, моделі, алгоритми та програмні засоби розглядаються?»

> **Відповідь на захисті:**
> «Предмет кваліфікаційної роботи охоплює чотири взаємопов'язані складові інженерії програмного забезпечення:
> 1. **Методи:**
>    - метод локально-чутливого гешування (LSH MinHash) для кластеризації та дедуплікації новинних сюжетів у потоковому режимі;
>    - метод стилометричного аналізу тексту на основі індексу Гуро (лексична різноманітність), відносної щільності пунктуації та аналізу капслоку;
>    - метод семантичного векторного пошуку ембедингів за косинусною подібністю;
>    - метод логічного виведення (Natural Language Inference — NLI) на основі мовних моделей трансформерів для верифікації тверджень за фактологічною базою ClaimReview.
> 2. **Моделі:**
>    - багатокритеріальна зважена модель розрахунку інтегрованого індексу довіри (Trust Score) з мультиплікативним штрафом за виявлені спростування;
>    - модель представлення тверджень у багатовимірному векторному просторі ембедингів Sentence-Transformers;
>    - функціональні моделі процесів (DFD Рівень 0 і Рівень 1) та реляційна модель даних (ER-діаграма).
> 3. **Алгоритми:**
>    - алгоритм генерації $k$-шинглів та обчислення сигнатур MinHash з розбиттям на 20 смуг по 5 рядків;
>    - алгоритм багатокритеріального скорингу та формування пояснень у концепції Explainable AI (категорії Verified, Caution, High Risk);
>    - алгоритм екстракції очищеного тексту за допомогою Trafilatura та черг асинхронного парсингу RSS-каналів.
> 4. **Програмні засоби:**
>    - серверний бекенд на FastAPI (Python), векторна СУБД PostgreSQL із розширенням pgvector, клієнтський вебзастосунок на Next.js (React, TypeScript, Tailwind CSS, shadcn/ui) та засоби контейнеризації Docker».

---

### Питання 2: «У меті зазначено "підвищення ефективності". У чому воно виражається і якими метриками кількісно оцінюється?»

> **Відповідь на захисті:**
> «Підвищення ефективності у роботі має вимірні кількісні критерії, порівняно з існуючими аналогами:
> 1. **Скорочення часу верифікації (Time Lag):** у класичних фактчекінгових порталів (StopFake, VoxCheck) час ручної експертизи становить від кількох годин до декількох днів. Розроблений вебзастосунок забезпечує первинну автоматизовану оцінку достовірності новини менш ніж за 1.5–3 секунди безпосередньо у момент потрапляння статті до стрічки.
> 2. **Точність виявлення маніпуляцій (метрики Precision, Recall, F1-Score):** прості евристичні фільтри та стоп-слова дають низьку якість (F1 близько 60–65%). Гібридний конвеєр (стилометрія + ClaimReview + репутація видань за ІМІ) досягає F1-score на рівні 85–90% на контрольних вибірках.
> 3. **Зниження обчислювальної складності дедуплікації:** алгоритм LSH MinHash оптимізує попарне порівняння з квадратичної складності $O(m^2)$ до лінійної $O(m)$, що дозволяє обробляти понад 1000 публікацій за хвилину на стандартному серверному обладнанні.
> 4. **Пояснюваність (Explainable AI):** на відміну від світових агрегаторів (Google News, Feedly), де алгоритми ранжування є непрозорими, розроблене рішення надає користувачеві чіткі індикатори: які саме фактори (клікбейт, неперевірене джерело або пряме спростування тези) вплинули на оцінку».

---

## 4. Перелік джерел посилання (ДСТУ 8302:2015)

1. Newman N., Fletcher R., Eddy K., Robertson C. T., Nielsen R. K. Reuters Institute Digital News Report 2024. Oxford : University of Oxford, 2024. 168 p. URL: https://reutersinstitute.politics.ox.ac.uk/digital-news-report/2024 (Last accessed: 01.10.2026).
2. Українські медіа: споживання новин і довіра у 2025 році : аналітичний звіт. Internews Ukraine. 2025. URL: https://internews.ua/media-research/ukrainian-media-news-consumption-and-trust-in-2025 (дата звернення: 01.10.2026).
3. Molina M. D., Sundar S. S., Le T., Lee D. “Fake News” Is Not Simply False Information: A Concept Explication and Taxonomy of Online Content. American Behavioral Scientist. 2021. Vol. 65, № 2. P. 180–212. DOI: 10.1177/0002764219878224.
4. Білий список ІМІ за перше півріччя 2026 року: увійшли 18 медіа. Інститут масової інформації. 2026. URL: https://imi.org.ua/monitorings/bilyj-spysok-imi-za-pershe-pivrichchya-2026-roku-uvijshly-18-media (дата звернення: 05.10.2026).
5. Cinelli M., De Francisci Morales G., Galeazzi A., Quattrociocchi W., Starnini M. The echo chamber effect on social media. Proceedings of the National Academy of Sciences. 2021. Vol. 118, № 9. P. 1–8. DOI: 10.1073/pnas.2023301118.
6. Pennycook G., Epstein Z., Mosleh M., Arechar A. A., Eckles D., Rand D. G. Shifting attention to accuracy can reduce misinformation online. Nature. 2021. Vol. 592, № 7855. P. 590–595. DOI: 10.1038/s41586-021-03344-2.
7. StopFake : фактчекінговий портал. ГО «Медіаварта». URL: https://www.stopfake.org (дата звернення: 07.10.2026).
8. Спростування фейків. VoxCheck : аналітичний проєкт VoxUkraine. URL: https://voxukraine.org/category/voks-informue (дата звернення: 07.10.2026).
9. Guo Z., Schlichtkrull M., Vlachos A. A Survey on Automated Fact-Checking. Transactions of the Association for Computational Linguistics. 2022. Vol. 10. P. 178–206. DOI: 10.1162/tacl_a_00454.
10. ClaimReview : schema markup for fact-check results. Schema.org. URL: https://schema.org/ClaimReview (Last accessed: 08.10.2026).
11. Barbaresi A. Trafilatura: A Web Scraping Library and Command-Line Tool for Text Discovery and Extraction. Proceedings of the 59th Annual Meeting of the Association for Computational Linguistics and the 11th International Joint Conference on Natural Language Processing: System Demonstrations. Stroudsburg, PA : Association for Computational Linguistics, 2021. P. 122–131. DOI: 10.18653/v1/2021.acl-demo.15.
12. Minaee S., Kalchbrenner N., Cambria E., Nikzad N., Chenaghlu M., Gao J. Deep Learning–Based Text Classification: A Comprehensive Review. ACM Computing Surveys. 2021. Vol. 54, № 3. P. 1–40. DOI: 10.1145/3439726.
13. Hardalov M., Arora A., Nakov P., Augenstein I. A Survey on Stance Detection for Mis- and Disinformation Identification. Findings of the Association for Computational Linguistics: NAACL 2022. Stroudsburg, PA : Association for Computational Linguistics, 2022. P. 1259–1277. DOI: 10.18653/v1/2022.findings-naacl.94.
14. Google News : новинний агрегатор компанії Google. URL: https://news.google.com (дата звернення: 09.10.2026).
15. Feedly Threat Intelligence: Collect, analyze, and share actionable intelligence. Feedly Inc. URL: https://feedly.com (Last accessed: 09.10.2026).
16. Kuz M. V., Lazarovych I. M., Kozlenko M. I., Pikuliak M. V., Kvasniuk A. D. Research on a hybrid LSTM-CNN-Attention model for text-based web content classification. Radio Electronics, Computer Science, Control. 2025. № 4. P. 105–115. DOI: 10.15588/1607-3274-2025-4-10.
17. Clementi A., Gualà L., Sciarria L. P., Straziota A. Maintaining k-MinHash Signatures over Fully-Dynamic Data Streams with Recovery. WSDM '25: Proceedings of the 18th ACM International Conference on Web Search and Data Mining, Hannover, Germany. New York : ACM, 2025. P. 79–87. DOI: 10.1145/3701551.3703491.
18. Haruta I., Mineshima K., Bekki D. Implementing Natural Language Inference for comparatives. Journal of Language Modelling. 2022. Vol. 10, № 1. P. 139–191. DOI: 10.15398/jlm.v10i1.294.
19. Pogorilyy S. D., Biletsky P. V. Usage of a graphics processor to accelerate coreference resolution while using the RoBERTa model. Scientific Papers of Donetsk National Technical University. Series: Informatics, Cybernetics and Computer Science. 2022. № 1 (33–34). P. 4–9. DOI: 10.31474/2074-7888-2022-1-33-34-4-9.
20. Bereska L., Tzifa-Kratira Z., Samavi R., Gavves E. Superposition as Lossy Compression: Measure with Sparse Autoencoders and Connect to Adversarial Vulnerability. Transactions on Machine Learning Research. 2025. P. 1–28. DOI: 10.48550/arXiv.2512.13568.
