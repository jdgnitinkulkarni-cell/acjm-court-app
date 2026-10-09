(function(){
  const LANGUAGES = [
    {code:"hi", name:"Hindi", nativeName:"हिन्दी", script:"Devanagari"},
    {code:"mr", name:"Marathi", nativeName:"मराठी", script:"Devanagari"},
    {code:"sa", name:"Sanskrit", nativeName:"संस्कृत", script:"Devanagari"},
    {code:"pa", name:"Punjabi", nativeName:"ਪੰਜਾਬੀ", script:"Gurmukhi"},
    {code:"bn", name:"Bengali", nativeName:"বাংলা", script:"Bengali Script"},
    {code:"as", name:"Assamese", nativeName:"অসমীয়া", script:"Assamese Script"},
    {code:"or", name:"Odia", nativeName:"ଓଡ଼ିଆ", script:"Odia Script"},
    {code:"ta", name:"Tamil", nativeName:"தமிழ்", script:"Tamil Script"},
    {code:"te", name:"Telugu", nativeName:"తెలుగు", script:"Telugu Script"},
    {code:"kn", name:"Kannada", nativeName:"ಕನ್ನಡ", script:"Kannada Script"},
    {code:"ml", name:"Malayalam", nativeName:"മലയാളം", script:"Malayalam Script"},
    {code:"mni", name:"Meitei (Manipuri)", nativeName:"Meitei", script:"Meitei Mayek"}
  ];

  const SCRIPT_FONTS = {
    hi: `"Tiro Devanagari Hindi"`,
    mr: `"Tiro Devanagari Hindi"`,
    sa: `"Tiro Devanagari Hindi"`,
    pa: `"Tiro Devanagari Hindi"`,
    bn: `"Tiro Devanagari Hindi"`,
    as: `"Tiro Devanagari Hindi"`,
    or: `"Tiro Devanagari Hindi"`,
    ta: `"Tiro Devanagari Hindi"`,
    te: `"Tiro Devanagari Hindi"`,
    kn: `"Tiro Devanagari Hindi"`,
    ml: `"Tiro Devanagari Hindi"`,
    mni: `"Tiro Devanagari Hindi"`
  };

  const LABELS = {
    hi: {copy:"हिन्दी अनुवादित प्रति", mother:"चयनित मातृभाषा", script:"लिपि", source:"मूल न्यायालयीन प्रति की भाषा", question:"प्रश्न", answer:"उत्तर", caseNo:"ई. सी. सी. नं.", accusedName:"अभियुक्त का नाम", accusedAddress:"अभियुक्त का पता", date:"दिनांक", place:"स्थान", beforeMe:"मेरे समक्ष", accusedSig:"अभियुक्त के हस्ताक्षर", identifierSig:"पहचान कराने वाले के हस्ताक्षर", signature:"हस्ताक्षर"},
    mr: {copy:"मराठी अनुवादित प्रत", mother:"निवडलेली मातृभाषा", script:"लिपी", source:"मूळ न्यायालयीन प्रतीची भाषा", question:"प्रश्न", answer:"उत्तर", caseNo:"ई. सी. सी. क्र.", accusedName:"आरोपीचे नाव", accusedAddress:"आरोपीचा पत्ता", date:"दिनांक", place:"ठिकाण", beforeMe:"माझ्या समक्ष", accusedSig:"आरोपीची सही", identifierSig:"ओळख देणाऱ्याची सही", signature:"सही"},
    sa: {copy:"संस्कृत अनूदित प्रति", mother:"चिता मातृभाषा", script:"लिपिः", source:"मूल न्यायालयीय प्रतिलिपेः भाषा", question:"प्रश्नः", answer:"उत्तरम्", caseNo:"प्रकरण क्रमाङ्कः", accusedName:"अभियुक्तस्य नाम", accusedAddress:"अभियुक्तस्य पता", date:"दिनाङ्कः", place:"स्थानम्", beforeMe:"मम समक्षम्", accusedSig:"अभियुक्तस्य हस्ताक्षरम्", identifierSig:"परिचायकस्य हस्ताक्षरम्", signature:"हस्ताक्षरम्"},
    pa: {copy:"ਪੰਜਾਬੀ ਅਨੁਵਾਦਿਤ ਪ੍ਰਤੀ", mother:"ਚੁਣੀ ਹੋਈ ਮਾਤ ਭਾਸ਼ਾ", script:"ਲਿਪੀ", source:"ਮੂਲ ਅਦਾਲਤੀ ਪ੍ਰਤੀ ਦੀ ਭਾਸ਼ਾ", question:"ਸਵਾਲ", answer:"ਜਵਾਬ", caseNo:"ਈ. ਸੀ. ਸੀ. ਨੰ.", accusedName:"ਦੋਸ਼ੀ ਦਾ ਨਾਮ", accusedAddress:"ਦੋਸ਼ੀ ਦਾ ਪਤਾ", date:"ਤਾਰੀਖ", place:"ਸਥਾਨ", beforeMe:"ਮੇਰੇ ਸਾਹਮਣੇ", accusedSig:"ਦੋਸ਼ੀ ਦੇ ਦਸਤਖਤ", identifierSig:"ਪਛਾਣ ਕਰਾਉਣ ਵਾਲੇ ਦੇ ਦਸਤਖਤ", signature:"ਦਸਤਖਤ"},
    bn: {copy:"বাংলা অনূদিত কপি", mother:"নির্বাচিত মাতৃভাষা", script:"লিপি", source:"মূল আদালত কপির ভাষা", question:"প্রশ্ন", answer:"উত্তর", caseNo:"ই. সি. সি. নং", accusedName:"অভিযুক্তের নাম", accusedAddress:"অভিযুক্তের ঠিকানা", date:"তারিখ", place:"স্থান", beforeMe:"আমার সম্মুখে", accusedSig:"অভিযুক্তের স্বাক্ষর", identifierSig:"পরিচয়দাতার স্বাক্ষর", signature:"স্বাক্ষর"},
    as: {copy:"অসমীয়া অনুবাদিত প্ৰতিলিপি", mother:"নিৰ্বাচিত মাতৃভাষা", script:"লিপি", source:"মূল আদালতীয় প্ৰতিলিপিৰ ভাষা", question:"প্ৰশ্ন", answer:"উত্তৰ", caseNo:"ই. চি. চি. নং", accusedName:"অভিযুক্তৰ নাম", accusedAddress:"অভিযুক্তৰ ঠিকনা", date:"তাৰিখ", place:"স্থান", beforeMe:"মোৰ সন্মুখত", accusedSig:"অভিযুক্তৰ স্বাক্ষৰ", identifierSig:"চিনাক্তকাৰীৰ স্বাক্ষৰ", signature:"স্বাক্ষৰ"},
    or: {copy:"ଓଡ଼ିଆ ଅନୁବାଦିତ ପ୍ରତି", mother:"ଚୟନିତ ମାତୃଭାଷା", script:"ଲିପି", source:"ମୂଳ ଅଦାଲତୀ ପ୍ରତିର ଭାଷା", question:"ପ୍ରଶ୍ନ", answer:"ଉତ୍ତର", caseNo:"ଇ. ସି. ସି. ନଂ", accusedName:"ଅଭିଯୁକ୍ତଙ୍କ ନାମ", accusedAddress:"ଅଭିଯୁକ୍ତଙ୍କ ଠିକଣା", date:"ତାରିଖ", place:"ସ୍ଥାନ", beforeMe:"ମୋ ସମ୍ମୁଖରେ", accusedSig:"ଅଭିଯୁକ୍ତଙ୍କ ସହି", identifierSig:"ପରିଚୟଦାତାଙ୍କ ସହି", signature:"ସହି"},
    ta: {copy:"தமிழ் மொழிபெயர்ப்பு நகல்", mother:"தேர்ந்தெடுக்கப்பட்ட தாய்மொழி", script:"எழுத்து", source:"அசல் நீதிமன்ற நகலின் மொழி", question:"கேள்வி", answer:"பதில்", caseNo:"இ. சி. சி. எண்", accusedName:"குற்றம் சாட்டப்பட்டவரின் பெயர்", accusedAddress:"குற்றம் சாட்டப்பட்டவரின் முகவரி", date:"தேதி", place:"இடம்", beforeMe:"என் முன்னிலையில்", accusedSig:"குற்றம் சாட்டப்பட்டவரின் கையொப்பம்", identifierSig:"அடையாளம் காட்டுபவரின் கையொப்பம்", signature:"கையொப்பம்"},
    te: {copy:"తెలుగు అనువాద ప్రతీ", mother:"ఎంచుకున్న మాతృభాష", script:"లిపి", source:"మూల కోర్టు ప్రతీ భాష", question:"ప్రశ్న", answer:"సమాధానం", caseNo:"ఇ. సి. సి. నం.", accusedName:"నిందితుడి పేరు", accusedAddress:"నిందితుడి చిరునామా", date:"తేదీ", place:"స్థలం", beforeMe:"నా సమక్షంలో", accusedSig:"నిందితుడి సంతకం", identifierSig:"గుర్తింపు ఇచ్చిన వారి సంతకం", signature:"సంతకం"},
    kn: {copy:"ಕನ್ನಡ ಅನುವಾದಿತ ಪ್ರತಿ", mother:"ಆಯ್ಕೆ ಮಾಡಿದ ಮಾತೃಭಾಷೆ", script:"ಲಿಪಿ", source:"ಮೂಲ ನ್ಯಾಯಾಲಯದ ಪ್ರತಿಯ ಭಾಷೆ", question:"ಪ್ರಶ್ನೆ", answer:"ಉತ್ತರ", caseNo:"ಇ. ಸಿ. ಸಿ. ನಂ.", accusedName:"ಆರೋಪಿಯ ಹೆಸರು", accusedAddress:"ಆರೋಪಿಯ ವಿಳಾಸ", date:"ದಿನಾಂಕ", place:"ಸ್ಥಳ", beforeMe:"ನನ್ನ ಸಮಕ್ಷಮ", accusedSig:"ಆರೋಪಿಯ ಸಹಿ", identifierSig:"ಗುರುತಿಸಿದವರ ಸಹಿ", signature:"ಸಹಿ"},
    ml: {copy:"മലയാളം വിവർത്തന പകർപ്പ്", mother:"തിരഞ്ഞെടുത്ത മാതൃഭാഷ", script:"ലിപി", source:"അസൽ കോടതി പകർപ്പിന്റെ ഭാഷ", question:"ചോദ്യം", answer:"ഉത്തരം", caseNo:"ഇ. സി. സി. നമ്പർ", accusedName:"പ്രതിയുടെ പേര്", accusedAddress:"പ്രതിയുടെ വിലാസം", date:"തീയതി", place:"സ്ഥലം", beforeMe:"എന്റെ മുമ്പാകെ", accusedSig:"പ്രതിയുടെ ഒപ്പ്", identifierSig:"തിരിച്ചറിയിക്കുന്നയാളുടെ ഒപ്പ്", signature:"ഒപ്പ്"},
    mni: {copy:"Meitei translated copy", mother:"Mother tongue selected", script:"Script", source:"Original court copy language", question:"Question", answer:"Answer", caseNo:"Case No.", accusedName:"Accused Name", accusedAddress:"Accused Address", date:"Date", place:"Place", beforeMe:"Before Me", accusedSig:"Signature of Accused", identifierSig:"Signature of Identifier", signature:"Signature"}
  };

  const PHRASES = {
    hi: {
      "Further Statement of the above-named accused under Section 313 of the Code of Criminal Procedure, 1973 / Section 351 of the BNSS, 2023 (in Question-Answer form).":"उपरोक्त अभियुक्त का दंड प्रक्रिया संहिता, 1973 की धारा 313 / भारतीय नागरिक सुरक्षा संहिता, 2023 की धारा 351 के अधीन विशेष बयान (प्रश्न-उत्तर के रूप में)।",
      "Have you received all the case papers?":"क्या आपको प्रकरण के सभी कागजात प्राप्त हो गए हैं?",
      "Do you wish to state anything further in your defence?":"क्या आप अपने बचाव में और कुछ कहना चाहते हैं?",
      "The above statement is read over and explained to the accused, who admits that it is true and correct.":"उपरोक्त बयान अभियुक्त को पढ़कर और समझाकर सुनाया गया, जिसे अभियुक्त ने सही और सत्य होना स्वीकार किया।",
      "As per the deposition on oath given by the complainant witness in the present case":"वर्तमान प्रकरण में परिवादी पक्ष के साक्षी द्वारा शपथ पर दिए गए कथन के अनुसार",
      "you are required to disclose your specific defence in the present case. What is your specific defence?":"आपको इस प्रकरण में अपना विशिष्ट बचाव बताना आवश्यक है। आपका विशिष्ट बचाव क्या है?",
      "The facts stated in the affidavit are false.":"शपथपत्र में लिखित सभी तथ्य असत्य हैं।",
      "I have received all case papers.":"मुझे प्रकरण के सभी कागजात प्राप्त हो गए हैं।",
      "Yes":"हाँ",
      "No":"नहीं",
      "Before Me":"मेरे समक्ष",
      "Name of Accused":"अभियुक्त का नाम",
      "Address of Accused":"अभियुक्त का पता",
      "Question":"प्रश्न",
      "Answer":"उत्तर"
    },
    mr: {
      "Further Statement of the above-named accused under Section 313 of the Code of Criminal Procedure, 1973 / Section 351 of the BNSS, 2023 (in Question-Answer form).":"वरील आरोपीचे फौजदारी प्रक्रिया संहिता, 1973 चे कलम 313 / बी. एन. एस. एस., 2023 चे कलम 351 अंतर्गत विशेष निवेदन (प्रश्न-उत्तर स्वरूपात).",
      "Have you received all the case papers?":"तुम्हाला सर्व प्रकरणातील कागदपत्रे प्राप्त झाली आहेत का?",
      "Do you wish to state anything further in your defence?":"तुम्हाला तुमच्या बचावाबाबत आणखी काही सांगायचे आहे का?",
      "The above statement is read over and explained to the accused, who admits that it is true and correct.":"वरील निवेदन आरोपीस वाचून व समजावून सांगितल्यावर ते बरोबर, सत्य व खरे असल्याचे आरोपीने मान्य केले.",
      "Yes":"होय",
      "No":"नाही",
      "Before Me":"माझ्या समक्ष",
      "Name of Accused":"आरोपीचे नाव",
      "Address of Accused":"आरोपीचा पत्ता",
      "Question":"प्रश्न",
      "Answer":"उत्तर"
    }
  };

  const APPROVED_STATIC_PHRASES = {
    hi: {
      "શું તમને તમામ કેસ કાગળો પ્રાપ્ત થઈ ગયેલા છે?":"क्या आपको प्रकरण के सभी कागजात प्राप्त हो गए हैं?",
      "હા":"हाँ",
      "ના":"नहीं",
      "હાલના કામના ફરિયાદ પક્ષ ના સાક્ષી એ પોતાની સોગંદ ઉપર ની સર તપાસ માં એમ જણાવેલ છે કે, તમો આરોપી સામે તેમનું કાયદેસર નું લેણું / દેવું આવેલ હોય, તમો આરોપી પક્ષ તરફ થી પ્રાપ્ત થયેલ તકરારી ચેક / ઑ જ્યારે તેમણે રકમ ની વસૂલાત માટે રજૂ કરેલ, ત્યારે આ તકરારી ચેક / ઑ તમારા બેન્ક દ્વારા સોગંદનામાં અને રીટર્ન મેમો માં દર્શાવેલ કારણોસર પરત કરવા માં આવેલ. જેથી આવા ચેક ની રકમ ની માંગણી કરતી કાયદેસર ની નોટીસ ફરિયાદ પક્ષ એ તમો ઉપર નિયત સમય માં મોકલી આપવેલ હોવા છતાં, તમો આરોપી નિયત સમય મર્યાદામાં ચેક માં દર્શાવેલ કૂલ રકમ ની ફરિયાદ પક્ષ ને ચુકવણી કરવા માં કસૂર કરેલ છે. તે બાબતે તમારે શું કહેવું છે?":"वर्तमान प्रकरण में परिवादी पक्ष के साक्षी ने अपने शपथपत्र और मुख्य परीक्षण में यह कथन किया है कि आपके विरुद्ध उनका विधिसम्मत देय धन / दायित्व था, और आपकी ओर से प्राप्त विवादित चेक / आदेश को जब राशि की वसूली के लिए प्रस्तुत किया गया, तब वह विवादित चेक / आदेश आपके बैंक द्वारा शपथपत्र और रिटर्न मेमो में दर्शाए गए कारण से वापस कर दिया गया। इसलिए उक्त चेक की राशि की मांग करती विधिसम्मत नोटिस परिवादी पक्ष ने आपको नियत समय में भेजी थी, फिर भी आपने नियत समय सीमा में चेक में दर्शाई गई कुल राशि परिवादी पक्ष को अदा करने में चूक की है। इस संबंध में आपको क्या कहना है?",
      "સોગંદનામાં જણાવેલ તમામ હકીકતો ખોટી છે.":"शपथपत्र में बताई गई सभी बातें गलत हैं।",
      "નામ. સર્વોચ્ચ ન્યાયાલય ના Meters And Instruments Private Limited Versus Kanchan Mehta 2017 (0) AIJEL-SC 60915 ચુકાદા મુજબ તમો હાલના કામે તમારૂ વિશિષ્ટ પ્રકાર નું બચાવ રજૂ કરવા બંધાયેલ હોય, તમારૂ હાલના કામે વિશિષ્ટ પ્રકાર નું બચાવ શું રહેલ છે?":"माननीय सर्वोच्च न्यायालय के Meters And Instruments Private Limited Versus Kanchan Mehta 2017 (0) AIJEL-SC 60915 निर्णय के अनुसार आप वर्तमान प्रकरण में अपना विशिष्ट बचाव प्रस्तुत करने के लिए बाध्य हैं। आपका विशिष्ट बचाव क्या है?",
      "અમારા દ્વારા આપવામાં આવેલ સિક્યુરિટી પેટે ના ચેક નું દુરુપયોગ કરવામાં આવેલ છે.":"हमारे द्वारा सुरक्षा के रूप में दिए गए चेक का दुरुपयोग किया गया है।",
      "તમો આરોપી ને પોતાના બચાવ માં વિશેષ માં કાંઇ કહેવું છે?":"क्या आप अपने बचाव में और कुछ कहना चाहते हैं?",
      "અમે વધારાના સાક્ષી તપાસશું અને આ અંગે જવાબ આપશુ.":"हम अतिरिक्त साक्षियों की जांच करेंगे और इस संबंध में उत्तर देंगे।",
      "આ જણાવેલ આરોપી નું ફો. કા. સંહિતા, ૧૯૭૩ ની કલમ ૩૧૩ / બી. એન. એસ. એસ. ૨૦૨૩ કલમ ૩૫૧ હેઠળ નું વિશેષ નિવેદન (પ્રશ્ન-ઉત્તર સ્વરૂપ માં).":"उपरोक्त अभियुक्त का दंड प्रक्रिया संहिता, 1973 की धारा 313 / भारतीय नागरिक सुरक्षा संहिता, 2023 की धारा 351 के अधीन विशेष बयान (प्रश्न-उत्तर के रूप में)।",
      "ઉપરોક્ત નિવેદન આરોપી પક્ષ ને વાંચી સંભળાવતા તે બરાબર અને સાચું તથા ખરૂ હોવાનું કબૂલે છે.":"उपरोक्त बयान अभियुक्त को पढ़कर सुनाया और समझाया गया, जिसे अभियुक्त ने सही और सत्य होना स्वीकार किया।",
      "આરોપી પક્ષ ની સહી":"अभियुक्त पक्ष के हस्ताक्षर",
      "ઓળખ આપનાર ની સહી":"पहचान कराने वाले के हस्ताक्षर",
      "મારી રૂબરૂ":"मेरे समक्ष",
      "આરોપીનું નામ":"अभियुक्त का नाम",
      "આરોપી નું સરનામું":"अभियुक्त का पता",
      "સ્થળ અમદાવાદ શહેર.":"स्थान अहमदाबाद शहर."
    },
    mr: {
      "શું તમને તમામ કેસ કાગળો પ્રાપ્ત થઈ ગયેલા છે?":"तुम्हाला प्रकरणातील सर्व कागदपत्रे प्राप्त झाली आहेत का?",
      "હા":"होय",
      "ના":"नाही",
      "હાલના કામના ફરિયાદ પક્ષ ના સાક્ષી એ પોતાની સોગંદ ઉપર ની સર તપાસ માં એમ જણાવેલ છે કે, તમો આરોપી સામે તેમનું કાયદેસર નું લેણું / દેવું આવેલ હોય, તમો આરોપી પક્ષ તરફ થી પ્રાપ્ત થયેલ તકરારી ચેક / ઑ જ્યારે તેમણે રકમ ની વસૂલાત માટે રજૂ કરેલ, ત્યારે આ તકરારી ચેક / ઑ તમારા બેન્ક દ્વારા સોગંદનામાં અને રીટર્ન મેમો માં દર્શાવેલ કારણોસર પરત કરવા માં આવેલ. જેથી આવા ચેક ની રકમ ની માંગણી કરતી કાયદેસર ની નોટીસ ફરિયાદ પક્ષ એ તમો ઉપર નિયત સમય માં મોકલી આપવેલ હોવા છતાં, તમો આરોપી નિયત સમય મર્યાદામાં ચેક માં દર્શાવેલ કૂલ રકમ ની ફરિયાદ પક્ષ ને ચુકવણી કરવા માં કસૂર કરેલ છે. તે બાબતે તમારે શું કહેવું છે?":"सध्याच्या प्रकरणात फिर्यादी पक्षाच्या साक्षीदाराने आपल्या शपथपत्रात व मुख्य तपासात असे नमूद केले आहे की, तुमच्याविरुद्ध त्यांचे कायदेशीर देणे / दायित्व होते आणि तुमच्याकडून प्राप्त झालेला वादग्रस्त चेक / आदेश रकमेच्या वसुलीसाठी सादर केला असता तो चेक / आदेश तुमच्या बँकेने शपथपत्र व रिटर्न मेमोमध्ये नमूद केलेल्या कारणाने परत केला. त्यामुळे अशा चेकची रक्कम मागणारी कायदेशीर नोटीस फिर्यादी पक्षाने तुम्हाला नियत वेळेत पाठवली होती, तरीसुद्धा तुम्ही नियत वेळेत चेकमध्ये नमूद केलेली एकूण रक्कम फिर्यादी पक्षास अदा करण्यात कसूर केली आहे. याबाबत तुम्हाला काय म्हणायचे आहे?",
      "સોગંદનામાં જણાવેલ તમામ હકીકતો ખોટી છે.":"शपथपत्रात नमूद केलेल्या सर्व बाबी चुकीच्या आहेत.",
      "નામ. સર્વોચ્ચ ન્યાયાલય ના Meters And Instruments Private Limited Versus Kanchan Mehta 2017 (0) AIJEL-SC 60915 ચુકાદા મુજબ તમો હાલના કામે તમારૂ વિશિષ્ટ પ્રકાર નું બચાવ રજૂ કરવા બંધાયેલ હોય, તમારૂ હાલના કામે વિશિષ્ટ પ્રકાર નું બચાવ શું રહેલ છે?":"मा. सर्वोच्च न्यायालयाच्या Meters And Instruments Private Limited Versus Kanchan Mehta 2017 (0) AIJEL-SC 60915 या निर्णयानुसार, तुम्ही सदर प्रकरणात तुमचा विशिष्ट बचाव मांडण्यास बांधील आहात. तुमचा विशिष्ट बचाव काय आहे?",
      "અમારા દ્વારા આપવામાં આવેલ સિક્યુરિટી પેટે ના ચેક નું દુરુપયોગ કરવામાં આવેલ છે.":"आमच्याकडून सुरक्षा म्हणून दिलेल्या चेकचा गैरवापर करण्यात आला आहे.",
      "તમો આરોપી ને પોતાના બચાવ માં વિશેષ માં કાંઇ કહેવું છે?":"तुम्हाला तुमच्या बचावात आणखी काही सांगायचे आहे का?",
      "અમે વધારાના સાક્ષી તપાસશું અને આ અંગે જવાબ આપશુ.":"आम्ही अतिरिक्त साक्षीदार तपासू आणि याबाबत उत्तर देऊ.",
      "આ જણાવેલ આરોપી નું ફો. કા. સંહિતા, ૧૯૭૩ ની કલમ ૩૧૩ / બી. એન. એસ. એસ. ૨૦૨૩ કલમ ૩૫૧ હેઠળ નું વિશેષ નિવેદન (પ્રશ્ન-ઉત્તર સ્વરૂપ માં).":"वरील आरोपीचे फौजदारी प्रक्रिया संहिता, 1973 चे कलम 313 / बी. एन. एस. एस., 2023 चे कलम 351 अंतर्गत विशेष निवेदन (प्रश्न-उत्तर स्वरूपात).",
      "ઉપરોક્ત નિવેદન આરોપી પક્ષ ને વાંચી સંભળાવતા તે બરાબર અને સાચું તથા ખરૂ હોવાનું કબૂલે છે.":"वरील निवेदन आरोपीस वाचून व समजावून सांगितल्यावर ते बरोबर, सत्य व खरे असल्याचे आरोपीने मान्य केले.",
      "આરોપી પક્ષ ની સહી":"आरोपी पक्षाची सही",
      "ઓળખ આપનાર ની સહી":"ओळख देणाऱ्याची सही",
      "મારી રૂબરૂ":"माझ्यासमक्ष",
      "આરોપીનું નામ":"आरोपीचे नाव",
      "આરોપી નું સરનામું":"आरोपीचा पत्ता",
      "સ્થળ અમદાવાદ શહેર.":"ठिकाण अहमदाबाद शहर."
    }
  };

  const TERMS = {
    hi: {"Complainant":"परिवादी","complainant":"परिवादी","Witness":"साक्षी","witness":"साक्षी","Application":"प्रार्थना पत्र","application":"प्रार्थना पत्र","Copy":"प्रति","copy":"प्रति","Accused":"अभियुक्त","accused":"अभियुक्त","Court":"न्यायालय","court":"न्यायालय","Case":"प्रकरण","case":"प्रकरण","Plea":"अभियुक्त का निवेदन","Signature":"हस्ताक्षर","Identifier":"पहचान कराने वाला","Further Statement":"आगे का बयान","affidavit":"शपथपत्र","Affidavit":"शपथपत्र","surety":"जमानतदार","Surety":"जमानतदार","Bond":"बंधपत्र","bond":"बंधपत्र","Date":"दिनांक","Place":"स्थान"},
    mr: {"Complainant":"फिर्यादी","complainant":"फिर्यादी","Witness":"साक्षीदार","witness":"साक्षीदार","Application":"अर्ज","application":"अर्ज","Copy":"प्रत","copy":"प्रत","Accused":"आरोपी","accused":"आरोपी","Court":"न्यायालय","court":"न्यायालय","Case":"प्रकरण","case":"प्रकरण","Plea":"कबुलीजबाब","Signature":"सही","Identifier":"ओळख देणारा","Further Statement":"पुढील निवेदन","affidavit":"शपथपत्र","Affidavit":"शपथपत्र","surety":"जामीनदार","Surety":"जामीनदार","Bond":"बॉण्ड","bond":"बॉण्ड","Date":"दिनांक","Place":"ठिकाण"},
    sa: {"Complainant":"परिवादी","Witness":"साक्षी","Application":"आवेदनम्","Copy":"प्रतिलिपिः","Accused":"अभियुक्तः","Court":"न्यायालयः","Case":"प्रकरणम्","Signature":"हस्ताक्षरम्","Date":"दिनाङ्कः","Place":"स्थानम्"},
    pa: {"Complainant":"ਸ਼ਿਕਾਇਤਕਰਤਾ","Witness":"ਗਵਾਹ","Application":"ਅਰਜ਼ੀ","Copy":"ਨਕਲ","Accused":"ਦੋਸ਼ੀ","Court":"ਅਦਾਲਤ","Case":"ਮਾਮਲਾ","Signature":"ਦਸਤਖਤ","Date":"ਤਾਰੀਖ","Place":"ਸਥਾਨ"},
    bn: {"Complainant":"অভিযোগকারী","Witness":"সাক্ষী","Application":"আবেদন","Copy":"প্রতিলিপি","Accused":"অভিযুক্ত","Court":"আদালত","Case":"মামলা","Signature":"স্বাক্ষর","Date":"তারিখ","Place":"স্থান"},
    as: {"Complainant":"অভিযোগকাৰী","Witness":"সাক্ষী","Application":"আবেদন","Copy":"প্ৰতিলিপি","Accused":"অভিযুক্ত","Court":"আদালত","Case":"গোচৰ","Signature":"স্বাক্ষৰ","Date":"তাৰিখ","Place":"স্থান"},
    or: {"Complainant":"ଅଭିଯୋଗକାରୀ","Witness":"ସାକ୍ଷୀ","Application":"ଆବେଦନ","Copy":"ପ୍ରତିଲିପି","Accused":"ଅଭିଯୁକ୍ତ","Court":"ଅଦାଲତ","Case":"ମାମଲା","Signature":"ସହି","Date":"ତାରିଖ","Place":"ସ୍ଥାନ"},
    ta: {"Complainant":"புகார்தாரர்","Witness":"சாட்சி","Application":"மனு","Copy":"நகல்","Accused":"குற்றம் சாட்டப்பட்டவர்","Court":"நீதிமன்றம்","Case":"வழக்கு","Signature":"கையொப்பம்","Date":"தேதி","Place":"இடம்"},
    te: {"Complainant":"ఫిర్యాదుదారు","Witness":"సాక్షి","Application":"దరఖాస్తు","Copy":"ప్రతి","Accused":"నిందితుడు","Court":"న్యాయస్థానం","Case":"కేసు","Signature":"సంతకం","Date":"తేదీ","Place":"స్థలం"},
    kn: {"Complainant":"ದೂರುದಾರ","Witness":"ಸಾಕ್ಷಿ","Application":"ಅರ್ಜಿ","Copy":"ಪ್ರತಿ","Accused":"ಆರೋಪಿ","Court":"ನ್ಯಾಯಾಲಯ","Case":"ಪ್ರಕರಣ","Signature":"ಸಹಿ","Date":"ದಿನಾಂಕ","Place":"ಸ್ಥಳ"},
    ml: {"Complainant":"പരാതിക്കാരൻ","Witness":"സാക്ഷി","Application":"അപേക്ഷ","Copy":"പകർപ്പ്","Accused":"പ്രതി","Court":"കോടതി","Case":"കേസ്","Signature":"ഒപ്പ്","Date":"തീയതി","Place":"സ്ഥലം"},
    mni: {"Complainant":"Complainant","Witness":"Witness","Application":"Application","Copy":"Copy","Accused":"Accused","Court":"Court","Case":"Case","Signature":"Signature","Date":"Date","Place":"Place"}
  };

  const GU_TERMS = {
    hi: {"ફરિયાદી":"परिवादी","સાક્ષી":"साक्षी","નકલ":"प्रति","અરજી":"प्रार्थना पत्र","આરોપી":"अभियुक्त","કોર્ટ":"न्यायालय","અદાલત":"न्यायालय","કેસ":"प्रकरण","પ્રશ્ન":"प्रश्न","જવાબ":"उत्तर","તારીખ":"दिनांक","સ્થળ":"स्थान","નામ":"नाम","સરનામું":"पता","સહી":"हस्ताक्षर","જામીનદાર":"जमानतदार","બોન્ડ":"बंधपत्र","રકમ":"राशि"},
    mr: {"ફરિયાદી":"फिर्यादी","સાક્ષી":"साक्षीदार","નકલ":"प्रत","અરજી":"अर्ज","આરોપી":"आरोपी","કોર્ટ":"न्यायालय","અદાલત":"न्यायालय","કેસ":"प्रकरण","પ્રશ્ન":"प्रश्न","જવાબ":"उत्तर","તારીખ":"दिनांक","સ્થળ":"ठिकाण","નામ":"नाव","સરનામું":"पत्ता","સહી":"सही","જામીનદાર":"जामीनदार","બોન્ડ":"बॉण्ड","રકમ":"रक्कम"}
  };

  const BASE_LANGUAGES = [
    {code:"gu", name:"Gujarati", nativeName:"Gujarati", script:"Gujarati Script"},
    {code:"en", name:"English", nativeName:"English", script:"Roman"}
  ];

  const STATIC_TEXTS = [
    {module_name:"plea", form_name:"plea", field_key:"heading", source_text:"Plea of the Accused"},
    {module_name:"plea", form_name:"plea", field_key:"case_no", source_text:"Case Number"},
    {module_name:"plea", form_name:"plea", field_key:"complainant_name", source_text:"Complainant Name"},
    {module_name:"plea", form_name:"plea", field_key:"accused_name", source_text:"Accused Name"},
    {module_name:"plea", form_name:"plea", field_key:"father_husband_name", source_text:"Father / Husband Name"},
    {module_name:"plea", form_name:"plea", field_key:"caste", source_text:"Caste"},
    {module_name:"plea", form_name:"plea", field_key:"age", source_text:"Age"},
    {module_name:"plea", form_name:"plea", field_key:"occupation", source_text:"Occupation"},
    {module_name:"plea", form_name:"plea", field_key:"contact", source_text:"Contact Number"},
    {module_name:"plea", form_name:"plea", field_key:"address", source_text:"Address"},
    {module_name:"plea", form_name:"plea", field_key:"charge_selection", source_text:"Select Charge"},
    {module_name:"plea", form_name:"plea", field_key:"plea_question", source_text:"Do you plead guilty to the offence described above?"},
    {module_name:"plea", form_name:"plea", field_key:"plea_explanation", source_text:"The accusation has been read over and explained to the accused."},
    {module_name:"plea", form_name:"plea", field_key:"accused_signature", source_text:"Signature of Accused"},
    {module_name:"plea", form_name:"plea", field_key:"identifier_signature", source_text:"Signature of Identifier"},
    {module_name:"plea", form_name:"plea", field_key:"before_me", source_text:"Before Me"},

    {module_name:"primary_fs", form_name:"primary_fs", field_key:"heading", source_text:"Further Statement of the above-named accused under Section 313 of the Code of Criminal Procedure, 1973 / Section 351 of the BNSS, 2023 (in Question-Answer form)."},
    {module_name:"primary_fs", form_name:"primary_fs", field_key:"case_no", source_text:"Case Number"},
    {module_name:"primary_fs", form_name:"primary_fs", field_key:"accused_name", source_text:"Name of Accused"},
    {module_name:"primary_fs", form_name:"primary_fs", field_key:"accused_address", source_text:"Address of Accused"},
    {module_name:"primary_fs", form_name:"primary_fs", field_key:"question", source_text:"Question"},
    {module_name:"primary_fs", form_name:"primary_fs", field_key:"answer", source_text:"Answer"},
    {module_name:"primary_fs", form_name:"primary_fs", field_key:"question_case_papers", source_text:"Have you received all the case papers?"},
    {module_name:"primary_fs", form_name:"primary_fs", field_key:"question_complainant_evidence", source_text:"As per the deposition on oath given by the complainant witness in the present case, the witness has stated that there was a legally enforceable debt or liability against you, and the disputed cheque was returned by the bank for the reason shown in the return memo. What do you have to say about this?"},
    {module_name:"primary_fs", form_name:"primary_fs", field_key:"question_specific_defence", source_text:"You are required to disclose your specific defence in the present case. What is your specific defence?"},
    {module_name:"primary_fs", form_name:"primary_fs", field_key:"question_further_defence", source_text:"Do you wish to state anything further in your defence?"},
    {module_name:"primary_fs", form_name:"primary_fs", field_key:"read_over", source_text:"The above statement is read over and explained to the accused, who admits that it is true and correct."},
    {module_name:"primary_fs", form_name:"primary_fs", field_key:"date", source_text:"Date"},
    {module_name:"primary_fs", form_name:"primary_fs", field_key:"place", source_text:"Place"},
    {module_name:"primary_fs", form_name:"primary_fs", field_key:"accused_signature", source_text:"Signature of Accused"},
    {module_name:"primary_fs", form_name:"primary_fs", field_key:"identifier_signature", source_text:"Signature of Identifier"},
    {module_name:"primary_fs", form_name:"primary_fs", field_key:"before_me", source_text:"Before Me"},

    {module_name:"final_fs", form_name:"final_fs", field_key:"heading", source_text:"Further Statement of the above-named accused under Section 313 of the Code of Criminal Procedure, 1973 / Section 351 of the BNSS, 2023 (in Question-Answer form)."},
    {module_name:"final_fs", form_name:"final_fs", field_key:"case_no", source_text:"Case Number"},
    {module_name:"final_fs", form_name:"final_fs", field_key:"accused_name", source_text:"Name of Accused"},
    {module_name:"final_fs", form_name:"final_fs", field_key:"accused_address", source_text:"Address of Accused"},
    {module_name:"final_fs", form_name:"final_fs", field_key:"question", source_text:"Question"},
    {module_name:"final_fs", form_name:"final_fs", field_key:"answer", source_text:"Answer"},
    {module_name:"final_fs", form_name:"final_fs", field_key:"read_over", source_text:"The above statement is read over and explained to the accused, who admits that it is true and correct."},
    {module_name:"final_fs", form_name:"final_fs", field_key:"date", source_text:"Date"},
    {module_name:"final_fs", form_name:"final_fs", field_key:"place", source_text:"Place"},
    {module_name:"final_fs", form_name:"final_fs", field_key:"accused_signature", source_text:"Signature of Accused"},
    {module_name:"final_fs", form_name:"final_fs", field_key:"before_me", source_text:"Before Me"},

    {module_name:"bail", form_name:"bail", field_key:"affidavit_title", source_text:"Affidavit of Surety"},
    {module_name:"bail", form_name:"bail", field_key:"certificate_title", source_text:"Certificate by Surety"},
    {module_name:"bail", form_name:"bail", field_key:"bond_with_conditions", source_text:"Bond with Conditions"},
    {module_name:"bail", form_name:"bail", field_key:"bond_without_conditions", source_text:"Bond without Conditions"},
    {module_name:"bail", form_name:"bail", field_key:"bond_after_conviction", source_text:"Bond under Section 389 after Conviction"},
    {module_name:"bail", form_name:"bail", field_key:"surety_name", source_text:"Surety Name"},
    {module_name:"bail", form_name:"bail", field_key:"surety_address", source_text:"Surety Address"},
    {module_name:"bail", form_name:"bail", field_key:"bond_amount", source_text:"Bond Amount"},
    {module_name:"bail", form_name:"bail", field_key:"accused_signature", source_text:"Signature of Accused"},
    {module_name:"bail", form_name:"bail", field_key:"convict_signature", source_text:"Signature of Convict"},
    {module_name:"bail", form_name:"bail", field_key:"surety_signature", source_text:"Signature of Surety"},
    {module_name:"bail", form_name:"bail", field_key:"condition_presence", source_text:"The accused shall remain present before the Court on every date."},
    {module_name:"bail", form_name:"bail", field_key:"condition_no_offence", source_text:"The accused shall not commit a similar offence or involve himself in such offence."},
    {module_name:"bail", form_name:"bail", field_key:"condition_no_threat", source_text:"The accused shall not directly or indirectly threaten or induce any person acquainted with the facts of the case."},
    {module_name:"bail", form_name:"bail", field_key:"condition_cooperate", source_text:"The accused shall cooperate with investigation and shall remain present when called."},
    {module_name:"bail", form_name:"bail", field_key:"condition_mobile", source_text:"The accused shall give prior written intimation to the Court before changing the mobile number."},
    {module_name:"bail", form_name:"bail", field_key:"condition_country", source_text:"The accused shall not leave India without prior intimation to the Court."},

    {module_name:"surety", form_name:"surety", field_key:"heading", source_text:"Surety / Bond"},
    {module_name:"surety", form_name:"surety", field_key:"case_details", source_text:"Case Details"},
    {module_name:"surety", form_name:"surety", field_key:"personal_details", source_text:"Surety Personal Details"},
    {module_name:"surety", form_name:"surety", field_key:"occupational_details", source_text:"Occupational and Solvency Details"},
    {module_name:"surety", form_name:"surety", field_key:"document_type", source_text:"Nature of Document"},
    {module_name:"surety", form_name:"surety", field_key:"case_no", source_text:"Case Number"},
    {module_name:"surety", form_name:"surety", field_key:"complainant_name", source_text:"Complainant Name"},
    {module_name:"surety", form_name:"surety", field_key:"accused_name", source_text:"Accused Name"},
    {module_name:"surety", form_name:"surety", field_key:"surety_name", source_text:"Surety Name"},
    {module_name:"surety", form_name:"surety", field_key:"property_details", source_text:"Immovable Property Details"},
    {module_name:"surety", form_name:"surety", field_key:"solvency_proof", source_text:"Solvency Proof"},
    {module_name:"surety", form_name:"surety", field_key:"bond_amount", source_text:"Bond Amount"},
    {module_name:"surety", form_name:"surety", field_key:"before_me", source_text:"Before Me"}
  ];

  const STATIC_SOURCE_ALIASES = [
    {module_name:"primary_fs", form_name:"primary_fs", field_key:"question_case_papers", source_text:"શું તમને તમામ કેસ કાગળો પ્રાપ્ત થઈ ગયેલા છે?", canonical_text:"Have you received all the case papers?"},
    {module_name:"primary_fs", form_name:"primary_fs", field_key:"answer_yes", source_text:"હા", canonical_text:"Yes"},
    {module_name:"primary_fs", form_name:"primary_fs", field_key:"answer_no", source_text:"ના", canonical_text:"No"},
    {module_name:"primary_fs", form_name:"primary_fs", field_key:"question_complainant_evidence_gu", source_text:"હાલના કામના ફરિયાદ પક્ષ ના સાક્ષી એ પોતાની સોગંદ ઉપર ની સર તપાસ માં એમ જણાવેલ છે કે, તમો આરોપી સામે તેમનું કાયદેસર નું લેણું / દેવું આવેલ હોય, તમો આરોપી પક્ષ તરફ થી પ્રાપ્ત થયેલ તકરારી ચેક / ઑ જ્યારે તેમણે રકમ ની વસૂલાત માટે રજૂ કરેલ, ત્યારે આ તકરારી ચેક / ઑ તમારા બેન્ક દ્વારા સોગંદનામાં અને રીટર્ન મેમો માં દર્શાવેલ કારણોસર પરત કરવા માં આવેલ. જેથી આવા ચેક ની રકમ ની માંગણી કરતી કાયદેસર ની નોટીસ ફરિયાદ પક્ષ એ તમો ઉપર નિયત સમય માં મોકલી આપવેલ હોવા છતાં, તમો આરોપી નિયત સમય મર્યાદામાં ચેક માં દર્શાવેલ કૂલ રકમ ની ફરિયાદ પક્ષ ને ચુકવણી કરવા માં કસૂર કરેલ છે. તે બાબતે તમારે શું કહેવું છે?", canonical_text:"As per the deposition on oath given by the complainant witness in the present case, the witness has stated that there was a legally enforceable debt or liability against you, and the disputed cheque was returned by the bank for the reason shown in the return memo. What do you have to say about this?"},
    {module_name:"primary_fs", form_name:"primary_fs", field_key:"answer_affidavit_false", source_text:"સોગંદનામાં જણાવેલ તમામ હકીકતો ખોટી છે.", canonical_text:"The facts stated in the affidavit are false."},
    {module_name:"primary_fs", form_name:"primary_fs", field_key:"question_specific_defence_gu", source_text:"નામ. સર્વોચ્ચ ન્યાયાલય ના Meters And Instruments Private Limited Versus Kanchan Mehta 2017 (0) AIJEL-SC 60915 ચુકાદા મુજબ તમો હાલના કામે તમારૂ વિશિષ્ટ પ્રકાર નું બચાવ રજૂ કરવા બંધાયેલ હોય, તમારૂ હાલના કામે વિશિષ્ટ પ્રકાર નું બચાવ શું રહેલ છે?", canonical_text:"You are required to disclose your specific defence in the present case. What is your specific defence?"},
    {module_name:"primary_fs", form_name:"primary_fs", field_key:"answer_security_cheque", source_text:"અમારા દ્વારા આપવામાં આવેલ સિક્યુરિટી પેટે ના ચેક નું દુરુપયોગ કરવામાં આવેલ છે.", canonical_text:"The cheque given by us as security has been misused."},
    {module_name:"primary_fs", form_name:"primary_fs", field_key:"question_further_defence_gu", source_text:"તમો આરોપી ને પોતાના બચાવ માં વિશેષ માં કાંઇ કહેવું છે?", canonical_text:"Do you wish to state anything further in your defence?"},
    {module_name:"primary_fs", form_name:"primary_fs", field_key:"answer_additional_witnesses", source_text:"અમે વધારાના સાક્ષી તપાસશું અને આ અંગે જવાબ આપશુ.", canonical_text:"We will examine additional witnesses and give our answer regarding the same."},
    {module_name:"primary_fs", form_name:"primary_fs", field_key:"heading_gu", source_text:"આ જણાવેલ આરોપી નું ફો. કા. સંહિતા, ૧૯૭૩ ની કલમ ૩૧૩ / બી. એન. એસ. એસ. ૨૦૨૩ કલમ ૩૫૧ હેઠળ નું વિશેષ નિવેદન (પ્રશ્ન-ઉત્તર સ્વરૂપ માં).", canonical_text:"Further Statement of the above-named accused under Section 313 of the Code of Criminal Procedure, 1973 / Section 351 of the BNSS, 2023 (in Question-Answer form)."},
    {module_name:"primary_fs", form_name:"primary_fs", field_key:"read_over_gu", source_text:"ઉપરોક્ત નિવેદન આરોપી પક્ષ ને વાંચી સંભળાવતા તે બરાબર અને સાચું તથા ખરૂ હોવાનું કબૂલે છે.", canonical_text:"The above statement is read over and explained to the accused, who admits that it is true and correct."},
    {module_name:"primary_fs", form_name:"primary_fs", field_key:"accused_signature_gu", source_text:"આરોપી પક્ષ ની સહી", canonical_text:"Signature of Accused"},
    {module_name:"primary_fs", form_name:"primary_fs", field_key:"identifier_signature_gu", source_text:"ઓળખ આપનાર ની સહી", canonical_text:"Signature of Identifier"},
    {module_name:"primary_fs", form_name:"primary_fs", field_key:"before_me_gu", source_text:"મારી રૂબરૂ", canonical_text:"Before Me"},
    {module_name:"primary_fs", form_name:"primary_fs", field_key:"accused_name_gu", source_text:"આરોપીનું નામ", canonical_text:"Name of Accused"},
    {module_name:"primary_fs", form_name:"primary_fs", field_key:"accused_address_gu", source_text:"આરોપી નું સરનામું", canonical_text:"Address of Accused"},
    {module_name:"primary_fs", form_name:"primary_fs", field_key:"place_ahmedabad_gu", source_text:"સ્થળ અમદાવાદ શહેર.", canonical_text:"Place Ahmedabad City."}
  ];

  function getMeta(code){ return LANGUAGES.find(l => l.code === code) || BASE_LANGUAGES.find(l => l.code === code) || null; }
  function getLabels(code){ return LABELS[code] || LABELS.hi; }
  function isSupported(code){ return Boolean(LANGUAGES.find(l => l.code === code)); }
  function storageKey(){ return "acjm_translation_memory_v1"; }
  function staticStorageKey(){ return "acjm_static_translation_library_v1"; }
  function loadMemory(){ try { return JSON.parse(localStorage.getItem(storageKey()) || "[]"); } catch { return []; } }
  function saveMemory(items){ localStorage.setItem(storageKey(), JSON.stringify(items || [])); }
  function loadStaticLibrary(){ try { return JSON.parse(localStorage.getItem(staticStorageKey()) || "[]"); } catch { return []; } }
  function saveStaticLibrary(items){ localStorage.setItem(staticStorageKey(), JSON.stringify(items || [])); }
  function normalize(text){ return String(text || "").replace(/\s+/g, " ").trim(); }
  function staticLookup(source, target, moduleName){
    const n = normalize(source);
    return loadStaticLibrary().find(item =>
      item.target_language === target &&
      item.is_static &&
      item.is_approved &&
      item.approved_text &&
      (!moduleName || item.module_name === moduleName) &&
      normalize(item.source_text) === n
    );
  }
  function memoryLookup(source, target){
    const n = normalize(source);
    return staticLookup(source, target) || loadMemory().find(item => item.target_language === target && normalize(item.original_text) === n && item.approved_text);
  }
  function remember(source, target, translated, formType, fieldType, approved){
    const items = loadMemory();
    const n = normalize(source);
    const now = new Date().toISOString();
    const existing = items.find(item => item.target_language === target && normalize(item.original_text) === n);
    if(existing){
      existing.translated_text = translated;
      existing.approved_text = approved ? translated : existing.approved_text || "";
      existing.updated_date = now;
      existing.form_type = formType || existing.form_type || "";
      existing.field_type = fieldType || existing.field_type || "";
    } else {
      items.push({source_language:"auto", target_language:target, original_text:source, translated_text:translated, approved_text:approved ? translated : "", created_date:now, updated_date:now, form_type:formType || "", field_type:fieldType || ""});
    }
    saveMemory(items);
  }

  function allSeedLanguages(){ return [...BASE_LANGUAGES, ...LANGUAGES]; }
  function staticEntryKey(entry, code){ return `${entry.module_name}|${entry.form_name}|${entry.field_key}|${code}`; }
  function approvedStaticPhrase(source, code){
    const direct = APPROVED_STATIC_PHRASES[code]?.[normalize(source)] || APPROVED_STATIC_PHRASES[code]?.[String(source || "").trim()];
    if(direct) return direct;
    const alias = STATIC_SOURCE_ALIASES.find(item => normalize(item.source_text) === normalize(source));
    if(alias){
      const aliasDirect = APPROVED_STATIC_PHRASES[code]?.[normalize(alias.source_text)] || APPROVED_STATIC_PHRASES[code]?.[alias.source_text];
      if(aliasDirect) return aliasDirect;
      return translateByRulesOnly(alias.canonical_text, code);
    }
    return null;
  }
  function translateByRulesOnly(text, code){
    if(code === "gu") return String(text || "");
    if(code === "en"){
      const alias = STATIC_SOURCE_ALIASES.find(item => normalize(item.source_text) === normalize(text));
      return alias?.canonical_text || String(text || "");
    }
    const approved = approvedStaticPhrase(text, code);
    if(approved) return approved;
    const direct = translateByPhrase(text, code);
    if(direct) return applyLabelTerms(direct, code);
    const protectedText = protect(text);
    let translated = translateByPhrase(protectedText.text, code);
    if(!translated){
      translated = applyLabelTerms(protectedText.text, code);
      translated = replaceAllTerms(translated, TERMS[code]);
      if(GU_TERMS[code]) translated = replaceAllTerms(translated, GU_TERMS[code]);
    }
    return restore(translated, protectedText.values);
  }
  function seedTranslationLibrary(){
    const now = new Date().toISOString();
    const library = loadStaticLibrary();
    const seen = new Set(library.map(item => staticEntryKey(item, item.target_language)));
    let added = 0;
    [...STATIC_TEXTS, ...STATIC_SOURCE_ALIASES].forEach(entry => {
      allSeedLanguages().forEach(lang => {
        const key = staticEntryKey(entry, lang.code);
        if(seen.has(key)) return;
        library.push({
          module_name: entry.module_name,
          form_name: entry.form_name,
          field_key: entry.field_key,
          source_text: entry.source_text,
          target_language: lang.code,
          approved_text: translateByRulesOnly(entry.source_text, lang.code),
          is_static: true,
          is_approved: true,
          created_at: now,
          updated_at: now
        });
        seen.add(key);
        added += 1;
      });
    });
    if(added) saveStaticLibrary(library);
    return {added, total:library.length, static_keys:STATIC_TEXTS.length + STATIC_SOURCE_ALIASES.length, languages:allSeedLanguages().map(lang => lang.code)};
  }
  function moduleFromOptions(options){
    const value = String(options?.moduleName || options?.formType || "").toLowerCase();
    if(value.includes("primary")) return "primary_fs";
    if(value.includes("final")) return "final_fs";
    if(value.includes("plea")) return "plea";
    if(value.includes("surety")) return "surety";
    if(value.includes("bail") || value.includes("bond")) return "bail";
    return "";
  }
  function missingStaticTranslations(moduleName, code){
    if(!moduleName || code === "en" || code === "gu") return [];
    const library = loadStaticLibrary();
    return [...STATIC_TEXTS, ...STATIC_SOURCE_ALIASES]
      .filter(entry => entry.module_name === moduleName)
      .filter(entry => !library.find(item =>
        item.module_name === entry.module_name &&
        item.form_name === entry.form_name &&
        item.field_key === entry.field_key &&
        item.target_language === code &&
        item.is_static &&
        item.is_approved &&
        item.approved_text
      ))
      .map(entry => entry.field_key);
  }
  function missingStaticWarningHtml(missing, code, options){
    const meta = getMeta(code);
    const title = "Static translation library is incomplete for this module and selected language. Please run translation seeding or complete missing translations.";
    return `<div class="${options?.className || "acjm-translation-copy"}" data-mother-tongue-copy="1" data-translation-annex="1" data-translated-language="${escapeHtml(code)}" style="font-family:${SCRIPT_FONTS[code] || SCRIPT_FONTS.hi}!important">
      <h2>${escapeHtml(title)}</h2>
      <p><strong>Language:</strong> ${escapeHtml(meta?.name || code)}</p>
      <p><strong>Missing keys:</strong> ${escapeHtml(missing.join(", "))}</p>
    </div>`;
  }

  function protect(text){
    const values = [];
    let out = String(text || "");
    const patterns = [
      /\b[A-Z]{1,5}\/?[A-Z]*\/?\d+\/\d{4}\b/g,
      /\beCC\/No\.\/[^\s,;]+/gi,
      /\b\d{1,2}[\/-]\d{1,2}[\/-]\d{4}\b/g,
      /\b\d{10}\b/g,
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      /\b(?:Section|Sec\.?|કલમ|ધારા)\s*[\dA-Za-z()./-]+/gi,
      /\b\d{4}\s*\(0\)\s*[A-Z]+[A-Z-]*\s*\d+\b/g,
      /\bRs\.?\s*[\d,]+(?:\/-)?/gi
    ];
    patterns.forEach(pattern => {
      out = out.replace(pattern, match => {
        const token = `{{PROTECTED_${values.length}}}`;
        values.push(match);
        return token;
      });
    });
    return {text:out, values};
  }
  function restore(text, values){ return String(text || "").replace(/\{\{PROTECTED_(\d+)\}\}/g, (_, i) => values[Number(i)] || ""); }

  function replaceAllTerms(text, dict){
    let out = String(text || "");
    Object.entries(dict || {}).sort((a,b) => b[0].length - a[0].length).forEach(([from,to]) => {
      out = out.split(from).join(to);
    });
    return out;
  }

  function translateByPhrase(text, code){
    const phraseMap = PHRASES[code] || {};
    const normalized = normalize(text).replace(/^[-:–\s]+/, "");
    if(phraseMap[normalized]) return phraseMap[normalized];
    for(const [from, to] of Object.entries(phraseMap)){
      if(normalized.includes(from)) return normalized.replace(from, to);
    }
    return null;
  }

  function translateText(text, code, options){
    if(!isSupported(code)) return String(text || "");
    const source = String(text || "").trim();
    if(!source) return "";
    const staticCached = staticLookup(source, code, moduleFromOptions(options));
    if(staticCached) return staticCached.approved_text;
    const direct = translateByPhrase(source, code);
    if(direct) return applyLabelTerms(direct, code);
    const labels = getLabels(code);
    const protectedText = protect(source);
    const cached = memoryLookup(protectedText.text, code);
    if(cached) return restore(cached.approved_text, protectedText.values);
    let translated = translateByPhrase(protectedText.text, code);
    if(!translated){
      translated = applyLabelTerms(protectedText.text, code);
      translated = replaceAllTerms(translated, TERMS[code]);
      if(GU_TERMS[code]) translated = replaceAllTerms(translated, GU_TERMS[code]);
    }
    translated = restore(translated, protectedText.values);
    remember(source, code, translated, options?.formType, options?.fieldType, true);
    return translated;
  }

  function applyLabelTerms(text, code){
    const labels = getLabels(code);
    return String(text || "")
      .replace(/\bQuestion\b|પ્રશ્ન|સવાલ/g, labels.question)
      .replace(/\bAnswer\b|Ans\.?|જવાબ|ઉત્તર/g, labels.answer)
      .replace(/\bName of Accused\b|આરોપીનું નામ|આરોપી નું નામ/g, labels.accusedName)
      .replace(/\bAddress of Accused\b|આરોપીનું સરનામું|આરોપી નું સરનામું/g, labels.accusedAddress)
      .replace(/\bBefore Me\b|મારી રૂબરૂ|મારી સમક્ષ/g, labels.beforeMe)
      .replace(/\bDate\b|Dt\.|તા\./g, labels.date)
      .replace(/\bPlace\b|સ્થળ/g, labels.place);
  }

  function printableLines(doc, code){
    const clone = doc.cloneNode(true);
    clone.querySelectorAll("[data-mother-tongue-copy='1'],[data-translation-annex='1'],.no-print,button").forEach(node => node.remove());
    const lines = [];
    clone.querySelectorAll("tr").forEach(row => {
      const rowText = Array.from(row.cells || []).map(cell => (cell.innerText || "").trim()).filter(Boolean).join(" ");
      if(rowText) lines.push(rowText);
      row.remove();
    });
    clone.querySelectorAll(".case-line,.court-head,h1,h2,h3,p,li,.signature-row div,div").forEach(node => {
      if(node.querySelector("table,tr")) return;
      const text = (node.innerText || "").trim();
      if(text && !lines.includes(text)) lines.push(text);
    });
    if(!lines.length) lines.push(...(clone.innerText || "").split(/\n+/));
    return lines.map(line => line.trim()).filter(Boolean);
  }

  function annexHtml(doc, code, options){
    const meta = getMeta(code);
    if(!meta) return "";
    seedTranslationLibrary();
    const moduleName = moduleFromOptions(options);
    const missing = missingStaticTranslations(moduleName, code);
    if(missing.length) return missingStaticWarningHtml(missing, code, options);
    const labels = getLabels(code);
    const sourceLanguage = options?.sourceLanguage || "Gujarati";
    const lines = printableLines(doc, code).map(line => translateText(line, code, {...options, moduleName}));
    return `<div class="${options?.className || "acjm-translation-copy"}" data-mother-tongue-copy="1" data-translation-annex="1" data-translated-language="${code}" style="font-family:${SCRIPT_FONTS[code] || SCRIPT_FONTS.hi}!important">
      <h2>${escapeHtml(labels.copy || `Additional Translated Copy - ${meta.name}`)}</h2>
      <p><strong>${escapeHtml(labels.mother)}:</strong> ${escapeHtml(meta.name)}</p>
      <p><strong>${escapeHtml(labels.script)}:</strong> ${escapeHtml(meta.script)}</p>
      <p><strong>${escapeHtml(labels.source)}:</strong> ${escapeHtml(sourceLanguage)}</p>
      <div class="translation-box">
        ${lines.map(line => `<p class="translated-line">${escapeHtml(line)}</p>`).join("")}
      </div>
    </div>`;
  }

  function escapeHtml(value){
    return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
  }

  seedTranslationLibrary();

  window.ACJM_TRANSLATION_ENGINE = {
    languages: LANGUAGES,
    allLanguages: allSeedLanguages(),
    staticTexts: STATIC_TEXTS,
    isSupported,
    getMeta,
    getLabels,
    translateText,
    printableLines,
    annexHtml,
    seedTranslationLibrary,
    loadStaticLibrary,
    saveStaticLibrary,
    missingStaticTranslations,
    loadMemory,
    saveMemory,
    remember,
    storageKey,
    staticStorageKey,
    escapeHtml,
    scriptFonts: SCRIPT_FONTS
  };
  window.seedTranslationLibrary = seedTranslationLibrary;
})();
