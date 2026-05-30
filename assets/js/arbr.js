/* Supabase config
   ضع القيم من Supabase Dashboard > Project Settings > API.
   استخدم anon/public key فقط هنا، ولا تضع أي مفتاح إداري داخل GitHub Pages. */
const SUPABASE_URL = 'https://umxmwcwuwsvkvsbdhbdl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVteG13Y3d1d3N2a3ZzYmRoYmRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NDYwNjcsImV4cCI6MjA5NTAyMjA2N30.qCwKT7EU21JJKS-_73_uuXdLrhoI3a9644Wk73O2uJY';
const isSupabaseConfigured =
  Boolean(window.supabase) &&
  SUPABASE_URL.startsWith('https://') &&
  SUPABASE_ANON_KEY.length > 40;
const supabaseClient = isSupabaseConfigured
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const ARBR_PAGE = document.body.dataset.page || 'home';
const AUTH_REQUIRED_PAGES = new Set(['buy', 'deposit', 'sell', 'dashboard', 'orders', 'admin']);

function loginUrl(nextPage) {
  const next = nextPage || (location.pathname.split('/').pop() || 'dashboard.html');
  return `login.html?next=${encodeURIComponent(next)}`;
}

function goToLogin(nextPage) {
  window.location.href = loginUrl(nextPage);
}

let currentUser = null;
let currentProfile = null;
let currentWallet = null;
let currentPurchaseRequests = [];
let currentPilotDeposits = [];
let currentRedeemRequests = [];
let activeOrdersFilter = 'all';
let adminPurchaseRequests = [];
let adminPilotDeposits = [];
let adminSummary = { pendingPurchases: 0, pendingDeposits: 0, totalPending: 0, todayRequests: 0 };
let adminDashboardError = '';
let adminRealtimeChannel = null;

const ARBR_CONFIG = {
  totalSupply: 100000000,
  entryCurrency: 'OMR',
  entryTokenRate: 1000,
  spreadRate: 0.05,
  exitFeeRate: 0.10,
  lockDays: 30,
  maxSellPerDay: 2000,
  largeBuyVerificationAmount: 5000,
  stages: [
    { name: 'Founders', from: 0, to: 5000000, price: 0.001 },
    { name: 'Early VIP', from: 5000000, to: 15000000, price: 0.002 },
    { name: 'Private', from: 15000000, to: 30000000, price: 0.005 },
    { name: 'Pre Launch', from: 30000000, to: 50000000, price: 0.010 },
    { name: 'Launch', from: 50000000, to: 70000000, price: 0.025 },
    { name: 'Growth', from: 70000000, to: 90000000, price: 0.050 },
    { name: 'Internal Cap', from: 90000000, to: 100000000, price: 0.100 }
  ]
};
let estimatedSoldTokens = 0;

const I18N = {
  ar: {
    logoSub: 'The Digital Asset',
    navHome: 'الرئيسية',
    navAbout: 'عن ARBR',
    navFeatures: 'المزايا',
    navHow: 'كيف تبدأ',
    navPolicy: 'سياسة المنصة',
    navBuy: 'اشترِ',
    navDeposit: 'إيداع / تحويل',
    navSell: 'بيع / استرداد',
    navAdmin: 'الإدارة',
    login: 'تسجيل الدخول',
    signup: 'إنشاء حساب',
    hello: 'مرحبًا',
    greeting: 'مرحبًا، {name}',
    balanceLabel: 'الرصيد: {amount}',
    dashboardMenu: 'لوحة التحكم',
    myOrdersMenu: 'طلباتي',
    settings: 'الإعدادات',
    logout: 'تسجيل الخروج',
    heroKicker: '<span class="ltr-token">ARBR</span> للاستخدام اليومي والتجاري',
    heroSub: 'عملة رقمية عربية <span>موثوقة</span>',
    heroLead: 'لاستخدام الأشخاص والتجار في مدفوعات رقمية واضحة وسهلة داخل شبكة <span class="ltr-token">ARBR</span>.',
    visaPay: 'دفع بالبطاقة',
    digitalTransfer: 'تحويل رقمي',
    securityTransparency: 'أمان وشفافية',
    buyNow: '🪙 اشترِ ARBR الآن',
    investorLogin: 'دخول المستخدم ←',
    foundingPrice: 'سعر ARBR التأسيسي',
    priceIndicative: 'تقديري',
    priceStageNote: 'مرحلة Founders — للعرض التوضيحي فقط',
    statsDisclaimer: 'الأرقام أعلاه تأسيسية/توضيحية وليست بيانات تداول مباشرة.',
    statsSecurityValue: 'مراجعة يدوية',
    navMenuLabel: 'القائمة',
    totalSupply: 'إجمالي المعروض',
    qualifiedInvestors: 'مستخدم موثق',
    totalTransfers: 'إجمالي التحويلات',
    totalInvestments: 'إجمالي الطلبات',
    aboutTitle: 'عن <span>ARBR</span>',
    aboutDesc: 'Arab Rial منصة أصول رقمية رسمية لإدارة رصيد ARBR داخل النظام، وتوفير تجربة منظمة للأشخاص والتجار لمتابعة الطلبات والأرصدة والمدفوعات.',
    realToken: 'رصيد رقمي داخل المنصة',
    realTokenDesc: 'يظهر رصيد ARBR داخل لوحة المستخدم ويتم تحديثه من خلال عمليات معتمدة ومسجلة داخل النظام.',
    complianceSecurity: 'توثيق وحماية الحساب',
    complianceSecurityDesc: 'تدعم المنصة توثيق الحسابات، قفل بيانات الاتصال الأساسية، وتسجيل الطلبات برقم مرجعي واضح.',
    merchantReady: 'جاهز للأشخاص والتجار',
    merchantReadyDesc: 'يدعم ARBR الاستخدام اليومي والتجاري عبر رصيد واضح وطلبات قابلة للتتبع وطرق دفع منظمة.',
    whyTitle: 'لماذا <span>ARBR</span>؟',
    whyDesc: 'مزايا تركز على الثقة، التوثيق، الشفافية، سرعة المعالجة، ولوحة متابعة احترافية.',
    instantTransfer: 'معالجة سريعة',
    instantTransferDesc: 'إرسال الطلبات ومتابعتها من لوحة واحدة مع تحديثات حالة واضحة.',
    smartInvestment: 'شفافية الطلبات',
    smartInvestmentDesc: 'كل طلب يمتلك رقمًا مرجعيًا وحالة واضحة وتفاصيل يمكن الرجوع إليها.',
    layeredSecurity: 'أمان متعدد الطبقات',
    layeredSecurityDesc: 'إجراءات تحقق وتنظيم بيانات الحساب والطلبات للحفاظ على سلامة العمليات.',
    globalAccess: 'طرق دفع مرنة',
    globalAccessDesc: 'دعم USDT و Visa / Mastercard مع قابلية إضافة طرق دفع معتمدة.',
    vipMembership: 'عضوية VIP',
    vipMembershipDesc: 'حصص حصرية للأعضاء المؤسسين مع مزايا إضافية وأسعار دخول مبكر.',
    fullDashboard: 'لوحة تحكم متكاملة',
    fullDashboardDesc: 'إدارة محفظتك وطلباتك وسجل معاملاتك من مكان واحد بواجهة سهلة.',
    howTitle: 'كيف <span>تبدأ؟</span>',
    howDesc: 'أربع خطوات بسيطة للانضمام إلى منصة ARBR ومتابعة رصيدك وطلباتك الرقمية.',
    stepCreate: 'أنشئ حسابك',
    stepCreateDesc: 'سجل بياناتك الأساسية وأنشئ حسابًا لإدارة طلبات الشراء.',
    stepVerify: 'تحقق بسيط',
    stepVerifyDesc: 'أدخل الاسم والهاتف والبريد ومحفظة الاستلام بطريقة آمنة وسريعة.',
    stepPay: 'اختر الدفع',
    stepPayDesc: 'ادفع عبر USDT أو Visa/Mastercard بطريقة مشفرة وموثوقة.',
    stepReceive: 'استلم ARBR',
    stepReceiveDesc: 'بعد مراجعة الدفع يُصدر ARBR فورًا إلى محفظتك أو حسابك داخل المنصة.',
    dashboardTitle: 'لوحة <span>المستثمر</span>',
    dashboardDesc: 'ملخص حسابك ورصيدك وطلبات الشراء الأخيرة داخل ARBR.',
    phone: 'رقم الهاتف',
    accountStatus: 'حالة الحساب',
    verificationStatus: 'حالة التوثيق',
    activeStatus: 'نشط',
    balancesStats: 'الأرصدة والإحصائيات',
    arbrBalance: 'رصيد ARBR',
    lockedArbr: 'ARBR المقفل',
    totalDeposit: 'إجمالي الإيداع',
    purchaseRequests: 'طلبات الشراء',
    pendingReview: 'قيد المراجعة',
    recentPurchases: 'طلبات الشراء الأخيرة',
    myOrdersTitle: 'طلباتي <span>ARBR</span>',
    myOrdersDesc: 'تتبع كل طلبات الشراء الخاصة بحسابك فقط.',
    all: 'الكل',
    pending: 'قيد المراجعة',
    approved: 'موافق',
    rejectedStatus: 'مرفوض',
    rejected: 'تم رفض التحقق',
    noPurchaseRequests: 'لا توجد طلبات شراء حتى الآن.',
    noOrdersHere: 'لا توجد طلبات في هذا القسم.',
    approvedBalanceNotice: 'يتم تحديث الرصيد من خلال العمليات المعتمدة والمسجلة في النظام.',
    pilotTitle: 'عضوية <span>ARBR</span>',
    pilotDesc: 'إرسال طلب إيداع عضوية قابل للاسترداد داخل منصة Arab Rial.',
    pilotFormTitle: 'طلب إيداع عضوية',
    pilotAmount: 'مبلغ الإيداع (OMR)',
    paymentMethod: 'طريقة الدفع',
    choosePayment: 'اختر طريقة الدفع',
    platformAdminMethod: 'إدارة المنصة',
    bankTransfer: 'تحويل بنكي',
    paymentReference: 'رقم مرجع الدفع',
    optionalNote: 'ملاحظة (اختيارية)',
    pilotAgreement: 'أفهم أن هذا الطلب خاص بإيداع عضوية داخل منصة Arab Rial، ويتم اعتماده بعد مراجعة بيانات العملية من الإدارة.',
    submitPilot: '✦ إرسال طلب إيداع العضوية',
    pilotRequests: 'طلبات إيداع العضوية',
    noPilotDeposits: 'لا توجد طلبات إيداع عضوية حتى الآن.',
    sellTitle: 'طلب بيع / استرداد <span>ARBR</span>',
    sellDesc: 'معاينة تقديرية وفق نموذج البيع العكسي ورسوم المنصة، ويتم اعتماد الطلب بعد مراجعة الإدارة وتأكيد بيانات العملية.',
    loadingSell: 'جار تحميل معاينة البيع...',
    buyTitle: 'اشترِ <span>ARBR</span>',
    buyDesc: 'سعر الدخول المبكر: <span class="ltr-token">1 OMR = 1,000 ARBR</span>. اختر المبلغ وطريقة الدفع وأرسل طلبك.',
    buyFormTitle: 'طلب شراء ARBR',
    earlyPriceLabel: 'سعر الدخول المبكر',
    currentStage: 'المرحلة الحالية',
    amountOmani: 'المبلغ بالريال العماني (OMR)',
    walletNote: 'ملاحظة / محفظة استلام ARBR',
    estimatedAmount: 'الكمية المتوقعة',
    estimatedNote: 'الكمية تقديرية ويتم اعتماد الطلب بعد تأكيد بيانات العملية.',
    submitBuy: '🪙 إرسال طلب الشراء',
    paymentMethods: 'طرق الدفع المتاحة',
    usdtNetwork: 'TRC20 / Polygon / حسب الشبكة المعتمدة',
    manualNow: 'متاح الآن',
    securePaymentLink: 'عبر رابط دفع آمن ومشفر',
    readyToConnect: 'جاهز للربط',
    buyProcessText: 'بعد إرسال الطلب تتم مراجعة بيانات الدفع يدويًا من الإدارة. عند الموافقة يُحدَّث الطلب ويُضاف الرصيد المعتمد إلى محفظتك. قد تُحال بعض الطلبات إلى مراجعة إضافية لأسباب أمنية أو تنظيمية.',
    buyLimitText: 'الحد الأدنى للطلب <strong style="color:var(--gold-light)">10 OMR</strong>، ولا يوجد حد أقصى ثابت للطلبات.',
    ctaTitle: 'ابدأ رحلتك مع ARBR الآن 🚀',
    ctaDesc: 'انضم إلى مستخدمي المنصة واستفد من أسعار الدخول المبكر الحصرية.',
    loginNow: 'تسجيل الدخول الآن',
    investorAccess: 'بوابة المستثمر ARBR',
    investorProfile: 'Account Profile',
    loginInvestor: 'دخول الحساب',
    forgotPassword: 'نسيت كلمة المرور؟',
    email: 'البريد الإلكتروني',
    password: 'كلمة المرور',
    fullName: 'الاسم الكامل',
    createAccount: 'إنشاء حساب',
    loginFootnote: 'إدارة الحساب والمحفظة والطلبات داخل منصة ARBR',
    country: 'الدولة',
    saveChanges: 'حفظ التغييرات',
    close: 'إغلاق',
    refundTitle: 'طلب استرداد إيداع العضوية',
    refundDesc: 'لطلب الاسترداد، تواصل مع الإدارة واذكر رقم الطلب.',
    refundNote: 'تتم مراجعة طلبات الاسترداد من الإدارة، وسيتم التواصل معك عبر بيانات الحساب المسجلة.',
    requestConfirmed: 'تم تأكيد الطلب',
    requestNumber: 'رقم الطلب',
    requestUnderReview: 'تم إرسال طلبك بنجاح وهو الآن قيد المراجعة.',
    viewMyOrders: 'عرض طلباتي',
    orderDetails: 'تفاصيل الطلب',
    policyTitle: 'سياسة المنصة <span>والشفافية</span>',
    policyDesc: 'Arab Rial منصة أصول رقمية رسمية لإدارة رصيد ARBR داخل النظام، مع لوحة متابعة واضحة لكل مستخدم.',
    policyPoint1: 'Arab Rial منصة أصول رقمية رسمية لإدارة رصيد ARBR داخل النظام.',
    policyPoint2: 'تتم مراجعة جميع طلبات الشراء والبيع والاسترداد من إدارة المنصة.',
    policyPoint3: 'يتم تحديث أرصدة المستخدمين فقط من خلال عمليات معتمدة ومسجلة.',
    policyPoint4: 'كل طلب يمتلك رقمًا مرجعيًا وحالة واضحة يمكن متابعتها.',
    policyPoint5: 'توفر المنصة لوحة شفافة لتتبع الأرصدة والطلبات وسجل العمليات.',
    policyPoint6: 'تتطلب بعض الخدمات إكمال توثيق الحساب قبل استخدامها.',
    phoneLockedHelp: 'رقم الهاتف مرتبط بحسابك ولا يمكن تغييره من لوحة المستخدم. لتحديث رقم الهاتف، يرجى التواصل مع إدارة المنصة.',
    verificationRequired: 'يرجى إكمال التحقق من الحساب لاستخدام هذه الخدمة.',
    unverified: 'غير موثق',
    verificationPending: 'قيد المراجعة',
    verificationVerified: 'موثق',
    verificationRejected: 'مرفوض',
    grossValue: 'القيمة الإجمالية',
    serviceFee: 'رسوم الخدمة',
    processingFee: 'رسوم المعالجة',
    estimatedFinalValue: 'القيمة النهائية التقديرية',
    sellCalcNote: 'القيمة المعروضة تقديرية، ويتم اعتماد الطلب بعد مراجعة الإدارة وتأكيد بيانات العملية.',
    submitSellRequest: 'إرسال طلب البيع / الاسترداد',
    walletAddress: 'المحفظة / العنوان',
    createdDate: 'تاريخ الإنشاء',
    reviewedDate: 'تاريخ المراجعة',
    adminNote: 'ملاحظة الإدارة',
    adminDashboardTitle: 'لوحة تحكم <span>الإدارة</span>',
    adminDashboardDesc: 'عرض ومراجعة الطلبات المعلقة داخل Arab Rial مع إجراءات موافقة ورفض آمنة عبر Supabase.',
    adminPendingPurchases: 'طلبات الشراء المعلقة',
    adminPendingDeposits: 'طلبات الإيداع المعلقة',
    adminTotalPending: 'إجمالي الطلبات المعلقة',
    adminTodayRequests: 'طلبات اليوم',
    adminNewRequests: 'طلبات جديدة',
    adminNewRequestsWithCount: 'طلبات جديدة: {count}',
    adminRlsRequired: 'تحتاج صلاحيات الإدارة إلى إعداد RLS في Supabase',
    loadingAdmin: 'جار تحميل بيانات الإدارة...',
    adminNoPendingPurchases: 'لا توجد طلبات شراء معلقة',
    adminNoPendingDeposits: 'لا توجد طلبات إيداع معلقة',
    adminRequestId: 'رقم الطلب',
    adminDepositId: 'رقم الإيداع',
    adminUser: 'المستخدم',
    adminEmail: 'البريد الإلكتروني',
    adminAmount: 'المبلغ',
    adminAmountOmr: 'المبلغ OMR',
    adminArbrAmount: 'كمية ARBR',
    adminDate: 'التاريخ',
    adminStatus: 'الحالة',
    adminActions: 'الإجراءات',
    adminReference: 'المرجع',
    adminViewDetails: 'عرض التفاصيل',
    adminApprove: 'موافقة',
    adminReject: 'رفض',
    adminDetailsTitle: 'تفاصيل طلب الإدارة',
    adminUserId: 'معرّف المستخدم',
    adminUserName: 'اسم المستخدم',
    adminCreatedAt: 'تاريخ الإنشاء',
    adminNotAvailable: 'غير متوفر',
    adminApprovalSetupRequired: 'الموافقة تحتاج إعداد دوال آمنة في Supabase',
    adminActionSuccess: 'تم تحديث الطلب بنجاح',
    adminActionFailed: 'تعذر تحديث الطلب. تأكد من تطبيق دوال Supabase الآمنة.',
    adminNewRequestReceived: 'وصل طلب جديد',
    adminRefundable: 'قابل للاسترداد',
    adminNotes: 'الملاحظات',
    okUnderstood: 'حسنًا، فهمت',
    emailPlaceholder: 'name@example.com',
    passwordPlaceholder: '••••••••',
    fullNamePlaceholder: 'اكتب اسمك الكامل',
    phonePlaceholder: '+...',
    countryPlaceholder: 'مثال: Oman',
    amountPlaceholder: 'مثال: 100',
    paymentReferencePlaceholder: 'رقم التحويل أو المرجع',
    extraDetailsPlaceholder: 'أي تفاصيل إضافية...',
    walletPlaceholder: '0x... أو أي ملاحظة للطلب',
    requestSubmitted: 'تم إرسال طلبك بنجاح وهو الآن قيد المراجعة.',
    loginRequired: 'يجب تسجيل الدخول أولًا',
    loginBeforePurchase: 'يجب تسجيل الدخول أولًا قبل إرسال طلب الشراء',
    settingsSaved: '✓ تم حفظ التغييرات بنجاح',
    logoutSuccess: 'تم تسجيل الخروج',
    loginSuccess: '✓ تم تسجيل الدخول بنجاح',
    accountCreated: 'تم إنشاء الحساب. يرجى فتح بريدك الإلكتروني لتأكيد الحساب.',
    enterEmail: '⚠️ أدخل البريد الإلكتروني',
    enterPassword: '⚠️ أدخل كلمة المرور',
    enterFullName: '⚠️ أدخل الاسم الكامل',
    enterPhone: '⚠️ أدخل رقم الهاتف',
    shortPassword: '⚠️ كلمة المرور يجب ألا تقل عن 6 أحرف',
    enterWallet: '⚠️ أدخل محفظة الاستلام أو ملاحظة الطلب',
    minPurchase: '⚠️ الحد الأدنى للشراء 10 OMR',
    invalidAmount: 'يرجى إدخال مبلغ صحيح',
    choosePaymentWarning: 'يرجى اختيار طريقة الدفع',
    agreePilot: 'يجب الموافقة على شروط إيداع العضوية قبل الإرسال',
    pilotSubmitted: 'تم إرسال طلبك بنجاح وهو الآن قيد المراجعة.',
    sellSubmitted: 'تم إرسال طلبك بنجاح وهو الآن قيد المراجعة.',
    sending: 'جار الإرسال...',
    saving: 'جار الحفظ...',
    loggingIn: 'جار تسجيل الدخول...',
    creatingAccount: 'جار إنشاء الحساب...',
    submittingRequest: 'جار إرسال الطلب...',
    supabaseMissing: 'أضف رابط ومفتاح Supabase داخل الملف أولًا',
    sessionReadFailed: 'تعذر قراءة جلسة الدخول',
    profileLoadFailed: 'تعذر تحميل بيانات الحساب',
    purchaseLoadFailed: 'تعذر تحميل طلبات الشراء',
    loginFailed: 'تعذر تسجيل الدخول',
    loginRetry: 'تعذر تسجيل الدخول. حاول مرة أخرى.',
    signupFailed: 'تعذر إنشاء الحساب',
    settingsSaveFailed: 'تعذر حفظ الإعدادات',
    pilotSubmitFailed: 'تعذر إرسال طلب إيداع العضوية',
    requestFailed: 'تعذر تسجيل الطلب',
    loginTimeout: 'انتهت مهلة الاتصال أثناء تسجيل الدخول',
    verified: 'تم التحقق من الهوية',
    pendingIdentity: 'قيد المراجعة',
    rejectedIdentity: 'تم رفض التحقق',
    not_verified: 'لم يتم التحقق من الهوية'
  },
  en: {
    logoSub: 'The Digital Asset',
    navHome: 'Home',
    navAbout: 'About ARBR',
    navFeatures: 'Features',
    navHow: 'How to Start',
    navPolicy: 'Platform Policy',
    navBuy: 'Buy',
    navDeposit: 'Deposit / Transfer',
    navSell: 'Sell / Redeem',
    navAdmin: 'Admin',
    login: 'Login',
    signup: 'Create Account',
    hello: 'Hello',
    greeting: 'Hello, {name}',
    balanceLabel: 'Balance: {amount}',
    dashboardMenu: 'Dashboard',
    myOrdersMenu: 'My Orders',
    settings: 'Settings',
    logout: 'Logout',
    heroKicker: '<span class="ltr-token">ARBR</span> for everyday and merchant use',
    heroSub: 'A trusted <span>Arabic digital currency</span>',
    heroLead: 'For people and merchants who need clear, simple digital payments inside the <span class="ltr-token">ARBR</span> network.',
    visaPay: 'Card payment',
    digitalTransfer: 'Digital transfer',
    securityTransparency: 'Security and transparency',
    buyNow: '🪙 Buy ARBR now',
    investorLogin: 'Account login →',
    foundingPrice: 'ARBR founding price',
    priceIndicative: 'Indicative',
    priceStageNote: 'Founders stage — illustrative display only',
    statsDisclaimer: 'Figures above are founding/illustrative metrics, not live market data.',
    statsSecurityValue: 'Manual review',
    navMenuLabel: 'Menu',
    totalSupply: 'Total supply',
    qualifiedInvestors: 'Verified users',
    totalTransfers: 'Total transfers',
    totalInvestments: 'Total requests',
    aboutTitle: 'About <span>ARBR</span>',
    aboutDesc: 'Arab Rial is an official digital asset platform for managing ARBR balance inside the system, with an organized experience for users and merchants to track requests, balances, and payments.',
    realToken: 'Digital balance inside the platform',
    realTokenDesc: 'ARBR balance appears inside the user dashboard and is updated through approved and recorded transactions.',
    complianceSecurity: 'Account verification and protection',
    complianceSecurityDesc: 'The platform supports account verification, locked contact details, and request records with clear reference numbers.',
    merchantReady: 'Ready for users and merchants',
    merchantReadyDesc: 'ARBR supports everyday and merchant use through clear balances, trackable requests, and organized payment methods.',
    whyTitle: 'Why <span>ARBR</span>?',
    whyDesc: 'Features focused on trust, verification, transparency, fast processing, and a professional dashboard.',
    instantTransfer: 'Fast processing',
    instantTransferDesc: 'Submit and track requests from one dashboard with clear status updates.',
    smartInvestment: 'Request transparency',
    smartInvestmentDesc: 'Every request has a reference number, clear status, and details you can review.',
    layeredSecurity: 'Layered security',
    layeredSecurityDesc: 'Verification procedures and organized account and request data support transaction integrity.',
    globalAccess: 'Flexible payment methods',
    globalAccessDesc: 'Support for USDT and Visa / Mastercard with room for additional approved payment methods.',
    vipMembership: 'VIP membership',
    vipMembershipDesc: 'Exclusive allocations for founding members with additional benefits and early access prices.',
    fullDashboard: 'Integrated dashboard',
    fullDashboardDesc: 'Manage your wallet, requests, and transaction history from one simple interface.',
    howTitle: 'How to <span>start?</span>',
    howDesc: 'Four simple steps to join ARBR and track your digital balance and requests.',
    stepCreate: 'Create your account',
    stepCreateDesc: 'Enter your basic information and create an account to manage purchase requests.',
    stepVerify: 'Simple verification',
    stepVerifyDesc: 'Enter your name, phone, email, and receiving wallet securely and quickly.',
    stepPay: 'Choose payment',
    stepPayDesc: 'Pay through USDT or Visa/Mastercard in a secure and reliable way.',
    stepReceive: 'Receive ARBR',
    stepReceiveDesc: 'After payment review, ARBR is issued to your wallet or account inside the platform.',
    dashboardTitle: '<span>Investor</span> Dashboard',
    dashboardDesc: 'Your account summary, balance, and latest ARBR purchase requests.',
    phone: 'Phone number',
    accountStatus: 'Account status',
    verificationStatus: 'Verification status',
    activeStatus: 'Active',
    balancesStats: 'Balances and stats',
    arbrBalance: 'ARBR balance',
    lockedArbr: 'Locked ARBR',
    totalDeposit: 'Total deposit',
    purchaseRequests: 'Purchase requests',
    pendingReview: 'Pending review',
    recentPurchases: 'Recent purchase requests',
    myOrdersTitle: 'My <span>ARBR</span> Orders',
    myOrdersDesc: 'Track all purchase requests for your account only.',
    all: 'All',
    pending: 'Under review',
    approved: 'Approved',
    rejectedStatus: 'Rejected',
    rejected: 'Verification rejected',
    noPurchaseRequests: 'No purchase requests yet.',
    noOrdersHere: 'No requests in this section.',
    approvedBalanceNotice: 'Balances are updated through approved and recorded system transactions.',
    pilotTitle: '<span>ARBR</span> Membership',
    pilotDesc: 'Submit a refundable membership deposit request inside Arab Rial.',
    pilotFormTitle: 'Membership deposit request',
    pilotAmount: 'Deposit amount (OMR)',
    paymentMethod: 'Payment method',
    choosePayment: 'Choose payment method',
    platformAdminMethod: 'Platform administration',
    bankTransfer: 'Bank transfer',
    paymentReference: 'Payment reference number',
    optionalNote: 'Note (optional)',
    pilotAgreement: 'I understand that this request is for a membership deposit inside Arab Rial and is approved after administration reviews the transaction details.',
    submitPilot: '✦ Submit membership deposit request',
    pilotRequests: 'Membership deposit requests',
    noPilotDeposits: 'No membership deposit requests yet.',
    sellTitle: 'Sell / Redeem <span>ARBR</span>',
    sellDesc: 'Estimated preview based on the reverse sale model and platform fees. Requests are approved after admin review and transaction verification.',
    loadingSell: 'Loading sell preview...',
    buyTitle: 'Buy <span>ARBR</span>',
    buyDesc: 'Early access price: <span class="ltr-token">1 OMR = 1,000 ARBR</span>. Choose the amount, payment method, and submit your request.',
    buyFormTitle: 'ARBR purchase request',
    earlyPriceLabel: 'Early access price',
    currentStage: 'Current stage',
    amountOmani: 'Amount in Omani Rial (OMR)',
    walletNote: 'Note / ARBR receiving wallet',
    estimatedAmount: 'Estimated amount',
    estimatedNote: 'The amount is estimated and the request is approved after transaction verification.',
    submitBuy: '🪙 Submit purchase request',
    paymentMethods: 'Available payment methods',
    usdtNetwork: 'TRC20 / Polygon / according to the approved network',
    manualNow: 'Available now',
    securePaymentLink: 'Through a secure encrypted payment link',
    readyToConnect: 'Ready to connect',
    buyProcessText: 'After you submit, payment details are reviewed manually by administration. When approved, the request status is updated and credited ARBR is added to your wallet. Some requests may require additional compliance review.',
    buyLimitText: 'Minimum request amount is <strong style="color:var(--gold-light)">10 OMR</strong>, with no fixed maximum request limit.',
    ctaTitle: 'Start your ARBR journey now 🚀',
    ctaDesc: 'Join platform users and benefit from exclusive early access prices.',
    loginNow: 'Login now',
    investorAccess: 'ARBR Investor Portal',
    investorProfile: 'Account Profile',
    loginInvestor: 'Access Dashboard',
    forgotPassword: 'Forgot Password?',
    email: 'Email',
    password: 'Password',
    fullName: 'Full name',
    createAccount: 'Create Account',
    loginFootnote: 'Manage your wallet, requests and account inside ARBR',
    country: 'Country',
    saveChanges: 'Save changes',
    close: 'Close',
    refundTitle: 'Membership deposit refund',
    refundDesc: 'To request a refund, contact management and mention the request number.',
    refundNote: 'Refund requests are reviewed by administration, and you will be contacted using your registered account details.',
    requestConfirmed: 'Request confirmed',
    requestNumber: 'Request number',
    requestUnderReview: 'Your request has been submitted successfully and is now under review.',
    viewMyOrders: 'View my orders',
    orderDetails: 'Order details',
    policyTitle: 'Platform Policy <span>& Transparency</span>',
    policyDesc: 'Arab Rial is an official digital asset platform for managing ARBR balance inside the system, with a clear dashboard for every user.',
    policyPoint1: 'Arab Rial is an official digital asset platform for managing ARBR balance inside the system.',
    policyPoint2: 'All buy, sell, and redeem requests are reviewed by platform administration.',
    policyPoint3: 'User balances are updated only through approved and recorded transactions.',
    policyPoint4: 'Every request has a reference number and clear status for tracking.',
    policyPoint5: 'The platform provides a transparent dashboard for users to track balances, requests, and transaction records.',
    policyPoint6: 'Some services require account verification before use.',
    phoneLockedHelp: 'Your phone number is linked to your account and cannot be changed from the user dashboard. To update it, please contact platform administration.',
    verificationRequired: 'Please complete account verification to use this service.',
    unverified: 'Unverified',
    verificationPending: 'Pending Review',
    verificationVerified: 'Verified',
    verificationRejected: 'Rejected',
    grossValue: 'Gross value',
    serviceFee: 'Service fee',
    processingFee: 'Processing fee',
    estimatedFinalValue: 'Estimated final value',
    sellCalcNote: 'The displayed value is estimated. The request is approved after admin review and transaction verification.',
    submitSellRequest: 'Submit sell / redeem request',
    walletAddress: 'Wallet / address',
    createdDate: 'Created date',
    reviewedDate: 'Reviewed date',
    adminNote: 'Admin note',
    adminDashboardTitle: 'Admin <span>Dashboard</span>',
    adminDashboardDesc: 'Display and review pending requests inside Arab Rial with secure Supabase approve and reject actions.',
    adminPendingPurchases: 'Pending Purchase Requests',
    adminPendingDeposits: 'Pending Pilot Deposits',
    adminTotalPending: 'Total Pending Requests',
    adminTodayRequests: 'New Requests Today',
    adminNewRequests: 'New Requests',
    adminNewRequestsWithCount: 'New Requests: {count}',
    adminRlsRequired: 'Admin permissions require Supabase RLS setup',
    loadingAdmin: 'Loading admin data...',
    adminNoPendingPurchases: 'No pending purchase requests',
    adminNoPendingDeposits: 'No pending pilot deposits',
    adminRequestId: 'Request ID',
    adminDepositId: 'Deposit ID',
    adminUser: 'User',
    adminEmail: 'Email',
    adminAmount: 'Amount',
    adminAmountOmr: 'Amount OMR',
    adminArbrAmount: 'ARBR Amount',
    adminDate: 'Date',
    adminStatus: 'Status',
    adminActions: 'Actions',
    adminReference: 'Reference',
    adminViewDetails: 'View Details',
    adminApprove: 'Approve',
    adminReject: 'Reject',
    adminDetailsTitle: 'Admin request details',
    adminUserId: 'User ID',
    adminUserName: 'User name',
    adminCreatedAt: 'Created At',
    adminNotAvailable: 'Not available',
    adminApprovalSetupRequired: 'Approval requires secure Supabase functions setup',
    adminActionSuccess: 'Request updated successfully',
    adminActionFailed: 'Could not update the request. Confirm the secure Supabase functions are installed.',
    adminNewRequestReceived: 'New request received',
    adminRefundable: 'Refundable',
    adminNotes: 'Notes',
    okUnderstood: 'OK, understood',
    emailPlaceholder: 'name@example.com',
    passwordPlaceholder: '••••••••',
    fullNamePlaceholder: 'Enter your full name',
    phonePlaceholder: '+...',
    countryPlaceholder: 'Example: Oman',
    amountPlaceholder: 'Example: 100',
    paymentReferencePlaceholder: 'Transfer or reference number',
    extraDetailsPlaceholder: 'Any additional details...',
    walletPlaceholder: '0x... or any request note',
    requestSubmitted: 'Your request has been submitted successfully and is now under review.',
    loginRequired: 'Login required',
    loginBeforePurchase: 'Please login before submitting a purchase request',
    settingsSaved: '✓ Changes saved successfully',
    logoutSuccess: 'Logged out',
    loginSuccess: '✓ Logged in successfully',
    accountCreated: 'Account created. Please open your email to confirm the account.',
    enterEmail: '⚠️ Enter your email',
    enterPassword: '⚠️ Enter your password',
    enterFullName: '⚠️ Enter your full name',
    enterPhone: '⚠️ Enter your phone number',
    shortPassword: '⚠️ Password must be at least 6 characters',
    enterWallet: '⚠️ Enter the receiving wallet or request note',
    minPurchase: '⚠️ Minimum purchase is 10 OMR',
    invalidAmount: 'Please enter a valid amount',
    choosePaymentWarning: 'Please choose a payment method',
    agreePilot: 'You must agree to the membership deposit terms before submitting',
    pilotSubmitted: 'Your request has been submitted successfully and is now under review.',
    sellSubmitted: 'Your request has been submitted successfully and is now under review.',
    sending: 'Sending...',
    saving: 'Saving...',
    loggingIn: 'Logging in...',
    creatingAccount: 'Creating account...',
    submittingRequest: 'Submitting request...',
    supabaseMissing: 'Add the Supabase URL and key inside the file first',
    sessionReadFailed: 'Unable to read login session',
    profileLoadFailed: 'Unable to load account data',
    purchaseLoadFailed: 'Unable to load purchase requests',
    loginFailed: 'Login failed',
    loginRetry: 'Login failed. Please try again.',
    signupFailed: 'Unable to create account',
    settingsSaveFailed: 'Unable to save settings',
    pilotSubmitFailed: 'Unable to submit membership deposit request',
    requestFailed: 'Unable to submit request',
    loginTimeout: 'Login connection timed out',
    verified: 'Identity verified',
    pendingIdentity: 'Under review',
    rejectedIdentity: 'Verification rejected',
    not_verified: 'Identity not verified'
  }
};

let currentLang = localStorage.getItem('arbr_lang') === 'en' ? 'en' : 'ar';

function t(key, params = {}) {
  let value = I18N[currentLang]?.[key] ?? I18N.ar[key] ?? key;
  Object.entries(params).forEach(([name, replacement]) => {
    value = value.replaceAll('{' + name + '}', replacement);
  });
  return value;
}

function setLanguage(lang) {
  currentLang = lang === 'en' ? 'en' : 'ar';
  localStorage.setItem('arbr_lang', currentLang);
  document.documentElement.lang = currentLang;
  document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
  document.body.classList.toggle('lang-ar', currentLang === 'ar');
  document.body.classList.toggle('lang-en', currentLang === 'en');
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (key && I18N[currentLang]?.[key] !== undefined) el.innerHTML = t(key);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    if (key && I18N[currentLang]?.[key] !== undefined) el.setAttribute('placeholder', t(key));
  });
  document.querySelectorAll('[data-lang-toggle]').forEach(btn => {
    btn.textContent = currentLang === 'ar' ? 'English' : 'العربية';
  });
  document.querySelectorAll('button[data-i18n]').forEach(btn => {
    if (!btn.disabled) btn.dataset.originalText = btn.innerHTML;
  });
  updateLocalizedUserText();
}

function toggleLanguage() {
  setLanguage(currentLang === 'ar' ? 'en' : 'ar');
  if (currentUser) {
    renderPurchaseRequests();
    renderAllOrders(activeOrdersFilter);
    renderPilotDeposits();
    renderSellSection();
    if (isAdminUser()) {
      renderAdminSummary();
      renderAdminPurchaseRequests();
      renderAdminPilotDeposits();
      renderAdminNotificationBadge();
    }
  }
}

function updateLocalizedUserText() {
  if (currentUser && currentProfile) {
    const name = profileDisplayName();
    const balance = currentWallet?.arbr_balance || 0;
    document.getElementById('navUserName').textContent = t('greeting', { name });
    document.getElementById('navUserBalance').textContent = t('balanceLabel', { amount: formatNumber(balance, 'ARBR') });
    document.getElementById('dashAccountStatus').textContent = profileHasColumn('account_status') ? accountStatusLabel(currentProfile.account_status) : t('activeStatus');
    const verificationEl = document.getElementById('dashVerificationStatus');
    if (verificationEl) verificationEl.innerHTML = `<span class="verification-badge ${verificationClass()}">${verificationLabel()}</span>`;
  }
}

/* Toast */
const toast = document.getElementById('toast');
function showToast(msg, type = 'success') {
  toast.textContent = msg;
  toast.className = 'toast ' + type;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3200);
}

function requireSupabase() {
  if (supabaseClient) return true;
  showToast(t('supabaseMissing'), 'error');
  return false;
}

function setBusy(button, busy, text) {
  if (!button.dataset.originalText) button.dataset.originalText = button.innerHTML;
  button.disabled = busy;
  button.style.opacity = busy ? '.72' : '';
  button.style.cursor = busy ? 'wait' : '';
  button.innerHTML = busy ? text : button.dataset.originalText;
}

function withTimeout(promise, timeoutMs, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function formatNumber(value, suffix = '') {
  const n = Number(value || 0);
  const formatted = n.toLocaleString('en-US', { maximumFractionDigits: 2 }) + (suffix ? ' ' + suffix : '');
  return suffix ? '\u2068' + formatted + '\u2069' : formatted;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function profileDisplayName() {
  return currentProfile?.full_name || currentUser?.email || (currentLang === 'ar' ? 'مستخدم ARBR' : 'ARBR user');
}

function statusLabel(status) {
  const labels = {
    pending: t('pending'),
    reviewing: currentLang === 'ar' ? 'تحت المراجعة' : 'Reviewing',
    approved: currentLang === 'ar' ? 'تمت الموافقة' : 'Approved',
    rejected: t('rejectedStatus'),
    completed: currentLang === 'ar' ? 'مكتمل' : 'Completed'
  };
  return labels[status] || status || t('pending');
}

function statusClass(status) {
  if (['approved', 'completed', 'active', 'refunded'].includes(status)) return 'approved';
  if (['rejected', 'cancelled'].includes(status)) return 'rejected';
  return 'pending';
}

function pilotStatusLabel(status) {
  const labels = {
    pending: currentLang === 'ar' ? 'قيد المراجعة (pending)' : 'Pending',
    active: currentLang === 'ar' ? 'مفعّل (active)' : 'Active',
    refund_requested: currentLang === 'ar' ? 'طلب استرداد' : 'Refund requested',
    refunded: currentLang === 'ar' ? 'تم الاسترداد (refunded)' : 'Refunded',
    cancelled: currentLang === 'ar' ? 'ملغي' : 'Cancelled',
    approved: t('approved')
  };
  return labels[status] || status || t('pending');
}

function identityVerificationLabel(status) {
  return verificationLabel(status);
}

function verificationStatus() {
  const raw = currentProfile?.verification_status || currentProfile?.kyc_status || 'unverified';
  const mapped = {
    approved: 'verified',
    submitted: 'pending',
    pending: currentProfile?.verification_status ? 'pending' : 'unverified',
    not_verified: 'unverified'
  };
  return mapped[raw] || raw || 'unverified';
}

function verificationLabel(status = verificationStatus()) {
  const labels = {
    unverified: t('unverified'),
    pending: t('verificationPending'),
    verified: t('verificationVerified'),
    rejected: t('verificationRejected')
  };
  return labels[status] || labels.unverified;
}

function verificationClass(status = verificationStatus()) {
  if (status === 'verified') return 'verified';
  if (status === 'rejected') return 'rejected';
  return 'pending';
}

function isVerified() {
  return verificationStatus() === 'verified';
}

function requireVerifiedService() {
  if (isVerified()) return true;
  showToast(t('verificationRequired'), 'warning');
  return false;
}

function updateVerificationRestrictions() {
  const verified = isVerified();
  const pilotNotice = document.getElementById('pilotLockedNotice');
  const pilotSubmit = document.getElementById('pilotSubmit');
  if (pilotNotice) pilotNotice.classList.toggle('hidden', verified);
  if (pilotSubmit) {
    pilotSubmit.disabled = !verified;
    pilotSubmit.style.opacity = verified ? '' : '.55';
    pilotSubmit.style.cursor = verified ? '' : 'not-allowed';
  }
}

function accountStatusLabel(status) {
  const labels = {
    active: t('activeStatus'),
    disabled: currentLang === 'ar' ? 'معطل' : 'Disabled',
    under_review: t('pending')
  };
  return labels[status] || status || t('activeStatus');
}

function requestAmount(order) {
  return Number(order.amount_omr || 0);
}

function requestEstimated(order) {
  return Number(order.estimated_arbr || 0);
}

function requestDate(order) {
  return order.created_at ? new Date(order.created_at).toLocaleDateString(currentLang === 'ar' ? 'ar' : 'en-US') : '-';
}

function recordHasColumn(record, column) {
  return record && Object.prototype.hasOwnProperty.call(record, column);
}

function requestProcessedDate(order) {
  if (!recordHasColumn(order, 'processed_at')) return '';
  return order.processed_at ? new Date(order.processed_at).toLocaleDateString(currentLang === 'ar' ? 'ar' : 'en-US') : '-';
}

function requestId(order) {
  return '#ARBR-' + String(order.id || '').slice(-6).toUpperCase();
}

function depositId(deposit) {
  return '#DEP-' + String(deposit?.id || '').slice(-6).toUpperCase();
}

function redeemId(request) {
  return '#RED-' + String(request?.id || '').slice(-6).toUpperCase();
}

function profileHasColumn(column) {
  return currentProfile && Object.prototype.hasOwnProperty.call(currentProfile, column);
}

async function getCurrentUser() {
  if (!requireSupabase()) return null;
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    showToast(t('sessionReadFailed'), 'error');
    return null;
  }
  return data.session?.user || null;
}

async function loadUserProfile(user = currentUser) {
  if (!user) return null;
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();
  if (error) {
    showToast(t('profileLoadFailed'), 'error');
    return null;
  }
  return data || {
    id: user.id,
    email: user.email,
    full_name: user.user_metadata?.full_name || '',
    phone: user.user_metadata?.phone || ''
  };
}

async function loadUserWallet(user = currentUser) {
  if (!user) return null;
  const { data, error } = await supabaseClient
    .from('wallets')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) {
    return { arbr_balance: 0, locked_arbr: 0, total_deposit_omr: 0 };
  }
  return data || { arbr_balance: 0, locked_arbr: 0, total_deposit_omr: 0 };
}

async function loadPurchaseRequests(user = currentUser) {
  if (!user) return [];
  const { data, error } = await supabaseClient
    .from('purchase_requests')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) {
    showToast(t('purchaseLoadFailed'), 'error');
    return [];
  }
  return data || [];
}

async function loadPilotDeposits(user = currentUser) {
  if (!user) return [];
  const { data, error } = await supabaseClient
    .from('pilot_deposits')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) return [];
  return data || [];
}

async function loadRedeemRequests(user = currentUser) {
  if (!user) return [];
  const { data, error } = await supabaseClient
    .from('redeem_requests')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) return [];
  return data || [];
}

function isAdminUser() {
  return profileHasColumn('role') && currentProfile?.role === 'admin';
}

async function loadPlatformState() {
  if (!supabaseClient) return;
  const { data, error } = await supabaseClient
    .from('platform_state')
    .select('sold_tokens')
    .eq('id', 1)
    .maybeSingle();
  if (!error && data) estimatedSoldTokens = Number(data.sold_tokens || 0);
}

function adminFallbackText(value) {
  return value || t('adminNotAvailable');
}

function adminDate(value) {
  return value ? new Date(value).toLocaleString(currentLang === 'ar' ? 'ar' : 'en-US') : '-';
}

function todayStartIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

async function enrichAdminRowsWithProfiles(rows) {
  const userIds = [...new Set((rows || []).map(row => row.user_id).filter(Boolean))];
  if (!userIds.length) return rows || [];
  let profileMap = {};
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('id, full_name, email')
    .in('id', userIds);
  if (!error && Array.isArray(data)) {
    profileMap = data.reduce((acc, profile) => {
      acc[profile.id] = profile;
      return acc;
    }, {});
  }
  return (rows || []).map(row => ({
    ...row,
    _profileName: profileMap[row.user_id]?.full_name || '',
    _profileEmail: profileMap[row.user_id]?.email || ''
  }));
}

async function loadAdminPurchaseRequests() {
  const { data, error } = await supabaseClient
    .from('purchase_requests')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  adminPurchaseRequests = await enrichAdminRowsWithProfiles(data || []);
  return adminPurchaseRequests;
}

async function loadAdminPilotDeposits() {
  const { data, error } = await supabaseClient
    .from('pilot_deposits')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  adminPilotDeposits = await enrichAdminRowsWithProfiles(data || []);
  return adminPilotDeposits;
}

async function loadAdminCounts() {
  const start = todayStartIso();
  const [purchaseCount, depositCount, purchaseToday, depositToday] = await Promise.all([
    supabaseClient.from('purchase_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabaseClient.from('pilot_deposits').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabaseClient.from('purchase_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending').gte('created_at', start),
    supabaseClient.from('pilot_deposits').select('id', { count: 'exact', head: true }).eq('status', 'pending').gte('created_at', start)
  ]);
  const firstError = [purchaseCount, depositCount, purchaseToday, depositToday].find(result => result.error)?.error;
  if (firstError) throw firstError;
  adminSummary = {
    pendingPurchases: purchaseCount.count || 0,
    pendingDeposits: depositCount.count || 0,
    totalPending: (purchaseCount.count || 0) + (depositCount.count || 0),
    todayRequests: (purchaseToday.count || 0) + (depositToday.count || 0)
  };
}

async function loadAdminDashboard() {
  if (!isAdminUser() || !supabaseClient) return;
  adminDashboardError = '';
  const content = document.getElementById('adminDashboardContent');
  const notice = document.getElementById('adminPermissionNotice');
  if (notice) notice.classList.add('hidden');
  if (content) content.classList.remove('hidden');
  document.getElementById('adminPurchaseRequestsTable').innerHTML = `<div class="admin-state-card admin-loading" data-i18n="loadingAdmin">${t('loadingAdmin')}</div>`;
  document.getElementById('adminPilotDepositsTable').innerHTML = `<div class="admin-state-card admin-loading" data-i18n="loadingAdmin">${t('loadingAdmin')}</div>`;
  try {
    await Promise.all([
      loadAdminCounts(),
      loadAdminPurchaseRequests(),
      loadAdminPilotDeposits()
    ]);
  } catch (error) {
    adminDashboardError = error?.message || t('adminRlsRequired');
    adminPurchaseRequests = [];
    adminPilotDeposits = [];
    adminSummary = { pendingPurchases: 0, pendingDeposits: 0, totalPending: 0, todayRequests: 0 };
    if (notice) {
      notice.textContent = t('adminRlsRequired');
      notice.classList.remove('hidden');
    }
    if (content) content.classList.add('hidden');
  }
  renderAdminSummary();
  renderAdminPurchaseRequests();
  renderAdminPilotDeposits();
  renderAdminNotificationBadge();
  setLanguage(currentLang);
}

function renderAdminSummary() {
  const holder = document.getElementById('adminSummaryCards');
  if (!holder) return;
  const cards = [
    ['adminPendingPurchases', adminSummary.pendingPurchases, '🛒'],
    ['adminPendingDeposits', adminSummary.pendingDeposits, '💼'],
    ['adminTotalPending', adminSummary.totalPending, '📌'],
    ['adminTodayRequests', adminSummary.todayRequests, '🆕']
  ];
  holder.innerHTML = cards.map(([key, value, icon]) => `
    <div class="admin-summary-card">
      <small>${icon} ${t(key)}</small>
      <b>${value}</b>
    </div>
  `).join('');
}

function renderAdminNotificationBadge() {
  const badge = document.getElementById('adminNotificationBadge');
  const countEl = document.getElementById('adminNotificationCount');
  const textEl = document.getElementById('adminNotificationText');
  if (!badge || !countEl || !textEl) return;
  const count = isAdminUser() ? adminSummary.totalPending : 0;
  badge.classList.toggle('show', isAdminUser());
  countEl.textContent = count;
  textEl.textContent = t('adminNewRequestsWithCount', { count });
}

function renderAdminPurchaseRequests() {
  const holder = document.getElementById('adminPurchaseRequestsTable');
  const countEl = document.getElementById('adminPurchaseCount');
  if (!holder) return;
  if (countEl) countEl.textContent = adminSummary.pendingPurchases;
  if (adminDashboardError) return;
  if (!adminPurchaseRequests.length) {
    holder.innerHTML = `<div class="admin-state-card" data-i18n="adminNoPendingPurchases">${t('adminNoPendingPurchases')}</div>`;
    return;
  }
  holder.innerHTML = `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>${t('adminRequestId')}</th>
            <th>${t('adminUser')}</th>
            <th>${t('adminEmail')}</th>
            <th>${t('adminAmount')}</th>
            <th>${t('adminArbrAmount')}</th>
            <th>${t('paymentMethod')}</th>
            <th>${t('adminDate')}</th>
            <th>${t('adminStatus')}</th>
            <th>${t('adminActions')}</th>
          </tr>
        </thead>
        <tbody>
          ${adminPurchaseRequests.map(item => `
            <tr>
              <td class="req-id">${requestId(item)}</td>
              <td>${escapeHtml(adminFallbackText(item._profileName || item.user_id))}</td>
              <td>${escapeHtml(adminFallbackText(item._profileEmail))}</td>
              <td>${formatNumber(requestAmount(item), ARBR_CONFIG.entryCurrency)}</td>
              <td>${formatNumber(requestEstimated(item), 'ARBR')}</td>
              <td>${escapeHtml(item.payment_method || '-')}</td>
              <td>${adminDate(item.created_at)}</td>
              <td><span class="status-pill ${statusClass(item.status)}">${statusLabel(item.status)}</span></td>
              <td>${adminActionButtons('purchase', item.id)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  bindAdminActionButtons(holder);
}

function renderAdminPilotDeposits() {
  const holder = document.getElementById('adminPilotDepositsTable');
  const countEl = document.getElementById('adminDepositCount');
  if (!holder) return;
  if (countEl) countEl.textContent = adminSummary.pendingDeposits;
  if (adminDashboardError) return;
  if (!adminPilotDeposits.length) {
    holder.innerHTML = `<div class="admin-state-card" data-i18n="adminNoPendingDeposits">${t('adminNoPendingDeposits')}</div>`;
    return;
  }
  holder.innerHTML = `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>${t('adminDepositId')}</th>
            <th>${t('adminUser')}</th>
            <th>${t('adminEmail')}</th>
            <th>${t('adminAmountOmr')}</th>
            <th>${t('paymentMethod')}</th>
            <th>${t('adminReference')}</th>
            <th>${t('adminDate')}</th>
            <th>${t('adminStatus')}</th>
            <th>${t('adminActions')}</th>
          </tr>
        </thead>
        <tbody>
          ${adminPilotDeposits.map(item => `
            <tr>
              <td class="req-id">${depositId(item)}</td>
              <td>${escapeHtml(adminFallbackText(item._profileName || item.user_id))}</td>
              <td>${escapeHtml(adminFallbackText(item._profileEmail))}</td>
              <td>${formatNumber(item.amount_omr, ARBR_CONFIG.entryCurrency)}</td>
              <td>${escapeHtml(item.payment_method || '-')}</td>
              <td>${escapeHtml(item.payment_reference || '-')}</td>
              <td>${adminDate(item.created_at)}</td>
              <td><span class="status-pill ${statusClass(item.status)}">${pilotStatusLabel(item.status)}</span></td>
              <td>${adminActionButtons('deposit', item.id)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  bindAdminActionButtons(holder);
}

function adminActionButtons(type, id) {
  return `
    <div class="admin-actions">
      <button class="admin-action-btn view" type="button" data-admin-view="${type}" data-admin-id="${id}">${t('adminViewDetails')}</button>
      <button class="admin-action-btn approve" type="button" data-admin-action="approve" data-admin-type="${type}" data-admin-id="${id}">${t('adminApprove')}</button>
      <button class="admin-action-btn reject" type="button" data-admin-action="reject" data-admin-type="${type}" data-admin-id="${id}">${t('adminReject')}</button>
    </div>
  `;
}

function bindAdminActionButtons(scope = document) {
  scope.querySelectorAll('[data-admin-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.adminView;
      const id = btn.dataset.adminId;
      const item = type === 'purchase'
        ? adminPurchaseRequests.find(row => String(row.id) === String(id))
        : adminPilotDeposits.find(row => String(row.id) === String(id));
      if (item) openAdminDetailsModal(type, item);
    });
  });
  scope.querySelectorAll('[data-admin-disabled]').forEach(btn => {
    btn.addEventListener('click', showAdminActionDisabledToast);
  });
  scope.querySelectorAll('[data-admin-action]').forEach(btn => {
    btn.addEventListener('click', () => handleAdminReviewAction(btn));
  });
}

function setAdminModalAction(type, item) {
  const approveBtn = document.getElementById('adminApproveAction');
  const rejectBtn = document.getElementById('adminRejectAction');
  [approveBtn, rejectBtn].forEach(btn => {
    if (!btn) return;
    btn.dataset.adminType = type;
    btn.dataset.adminId = item.id;
    btn.disabled = false;
  });
}

function openAdminDetailsModal(type, item) {
  const content = document.getElementById('adminDetailsContent');
  if (!content) return;
  const common = {
    userId: item.user_id || '-',
    name: adminFallbackText(item._profileName),
    email: adminFallbackText(item._profileEmail),
    status: type === 'purchase' ? statusLabel(item.status) : pilotStatusLabel(item.status),
    created: adminDate(item.created_at)
  };
  if (type === 'purchase') {
    content.innerHTML = [
      detailItem(t('adminRequestId'), requestId(item)),
      detailItem(t('adminUserId'), common.userId),
      detailItem(t('adminUserName'), common.name),
      detailItem(t('adminEmail'), common.email),
      detailItem(t('adminAmount'), formatNumber(requestAmount(item), ARBR_CONFIG.entryCurrency)),
      detailItem(t('adminArbrAmount'), formatNumber(requestEstimated(item), 'ARBR')),
      detailItem(t('paymentMethod'), item.payment_method || '-'),
      detailItem(t('adminStatus'), common.status),
      detailItem(t('adminCreatedAt'), common.created),
      detailItem(t('walletNote'), item.note || item.wallet_address || '-', true),
      detailItem(t('adminNote'), item.admin_notes || item.admin_note || '-', true)
    ].join('');
  } else {
    content.innerHTML = [
      detailItem(t('adminDepositId'), depositId(item)),
      detailItem(t('adminUserId'), common.userId),
      detailItem(t('adminUserName'), common.name),
      detailItem(t('adminEmail'), common.email),
      detailItem(t('adminAmountOmr'), formatNumber(item.amount_omr, ARBR_CONFIG.entryCurrency)),
      detailItem(t('paymentMethod'), item.payment_method || '-'),
      detailItem(t('paymentReference'), item.payment_reference || '-'),
      detailItem(t('adminStatus'), common.status),
      detailItem(t('adminRefundable'), item.is_refundable ? (currentLang === 'ar' ? 'نعم' : 'Yes') : (currentLang === 'ar' ? 'لا' : 'No')),
      detailItem(t('adminCreatedAt'), common.created),
      detailItem(t('adminNotes'), item.notes || '-', true)
    ].join('');
  }
  setAdminModalAction(type, item);
  document.getElementById('adminDetailsModal').classList.add('open');
}

function closeAdminDetailsModal() {
  document.getElementById('adminDetailsModal').classList.remove('open');
}

function showAdminActionDisabledToast() {
  showToast(t('adminApprovalSetupRequired'), 'warning');
}

function adminReviewRpcName(type) {
  return type === 'purchase' ? 'admin_review_purchase_request' : 'admin_review_pilot_deposit';
}

function adminReviewParams(type, id, action) {
  if (type === 'purchase') {
    return {
      p_request_id: id,
      p_status: action === 'approve' ? 'approved' : 'rejected',
      p_admin_notes: null
    };
  }
  return {
    p_deposit_id: id,
    p_status: action === 'approve' ? 'approved' : 'rejected',
    p_admin_notes: null
  };
}

async function handleAdminReviewAction(btn) {
  if (!btn || btn.disabled || !supabaseClient || !isAdminUser()) return;
  const type = btn.dataset.adminType;
  const id = btn.dataset.adminId;
  const action = btn.dataset.adminAction;
  if (!type || !id || !['approve', 'reject'].includes(action)) return;

  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = currentLang === 'ar' ? 'جار التنفيذ...' : 'Working...';
  try {
    const { error } = await supabaseClient.rpc(adminReviewRpcName(type), adminReviewParams(type, id, action));
    if (error) throw error;
    adminAuditLog('admin_review_action', `${type}:${id}:${action}`);
    showToast(t('adminActionSuccess'), 'success');
    closeAdminDetailsModal();
    await loadAdminDashboard(true);
  } catch (error) {
    adminAuditLog('admin_review_action_failed', error?.message || `${type}:${id}:${action}`);
    showToast(t('adminActionFailed'), 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}


function setupAdminRealtime() {
  if (!supabaseClient) return;
  if (!isAdminUser()) {
    if (adminRealtimeChannel) {
      supabaseClient.removeChannel(adminRealtimeChannel);
      adminRealtimeChannel = null;
    }
    return;
  }
  if (adminRealtimeChannel) return;
  try {
    adminRealtimeChannel = supabaseClient
      .channel('arbr-admin-phase1')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'purchase_requests' }, () => {
        if (!isAdminUser()) return;
        showToast(t('adminNewRequestReceived'), 'success');
        loadAdminDashboard();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pilot_deposits' }, () => {
        if (!isAdminUser()) return;
        showToast(t('adminNewRequestReceived'), 'success');
        loadAdminDashboard();
      })
      .subscribe();
  } catch (error) {
    adminRealtimeChannel = null;
  }
}

function renderPilotDeposits() {
  const pilotList = document.getElementById('pilotList');
  if (!pilotList) return;
  if (!currentPilotDeposits.length) {
    pilotList.innerHTML = `<div class="empty-orders" data-i18n="noPilotDeposits">${t('noPilotDeposits')}</div>`;
    setLanguage(currentLang);
    return;
  }
  pilotList.innerHTML = `
    <div class="mini-table-wrap">
      <table class="mini-table">
        <thead>
          <tr>
            <th>${currentLang === 'ar' ? 'رقم الطلب' : 'Request ID'}</th>
            <th>${currentLang === 'ar' ? 'المبلغ' : 'Amount'}</th>
            <th>${t('paymentMethod')}</th>
            <th>${currentLang === 'ar' ? 'قابل للاسترداد' : 'Refundable'}</th>
            <th>${currentLang === 'ar' ? 'الحالة' : 'Status'}</th>
            <th>${currentLang === 'ar' ? 'التاريخ' : 'Date'}</th>
            <th>${currentLang === 'ar' ? 'إجراء' : 'Action'}</th>
          </tr>
        </thead>
        <tbody>
          ${currentPilotDeposits.map(deposit => `
            <tr>
              <td class="req-id">#DEP-${String(deposit.id || '').slice(-6).toUpperCase()}</td>
              <td>${formatNumber(deposit.amount_omr, ARBR_CONFIG.entryCurrency)}</td>
              <td>${escapeHtml(deposit.payment_method || '-')}</td>
              <td>${deposit.is_refundable ? (currentLang === 'ar' ? 'نعم' : 'Yes') : (currentLang === 'ar' ? 'لا' : 'No')}</td>
              <td><span class="status-pill ${statusClass(deposit.status)}">${pilotStatusLabel(deposit.status)}</span></td>
              <td>${deposit.created_at ? new Date(deposit.created_at).toLocaleDateString(currentLang === 'ar' ? 'ar' : 'en-US') : '-'}</td>
              <td><button class="small-btn" type="button" data-refund-id="${deposit.id}">${currentLang === 'ar' ? 'تعليمات الاسترداد' : 'Refund instructions'}</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  pilotList.querySelectorAll('[data-refund-id]').forEach(btn => {
    btn.addEventListener('click', () => openRefundInstructions(btn.dataset.refundId));
  });
  setLanguage(currentLang);
}

async function submitPilotDeposit(event) {
  event?.preventDefault();
  if (!currentUser) {
    openModal();
    showToast(t('loginRequired'), 'warning');
    return;
  }
  if (!requireVerifiedService()) return;
  const amount = Number(document.getElementById('pilotAmount').value || 0);
  const method = document.getElementById('pilotMethod').value;
  const reference = document.getElementById('pilotReference').value.trim();
  const note = document.getElementById('pilotNote').value.trim();
  const agreed = document.getElementById('pilotAgree').checked;
  if (amount <= 0) { showToast(t('invalidAmount'), 'warning'); return; }
  if (!method) { showToast(t('choosePaymentWarning'), 'warning'); return; }
  if (!agreed) { showToast(t('agreePilot'), 'warning'); return; }

  const btn = document.getElementById('pilotSubmit');
  setBusy(btn, true, t('sending'));
  const { data, error } = await supabaseClient
    .from('pilot_deposits')
    .insert({
      user_id: currentUser.id,
      amount_omr: amount,
      payment_method: method,
      payment_reference: reference,
      notes: note,
      status: 'pending',
      is_refundable: true
    })
    .select('id,status')
    .single();
  setBusy(btn, false);
  if (error) {
    showToast(t('pilotSubmitFailed') + ': ' + error.message, 'error');
    return;
  }
  showToast(t('pilotSubmitted'), 'success');
  showRequestSuccess({
    number: depositId(data),
    status: data?.status || 'pending',
    message: t('requestUnderReview')
  });
  document.getElementById('pilotForm').reset();
  currentPilotDeposits = await loadPilotDeposits(currentUser);
  renderPilotDeposits();
}

function openRefundInstructions(depositId) {
  document.getElementById('refundDepositId').textContent = '#DEP-' + String(depositId || '').slice(-6).toUpperCase();
  document.getElementById('refundModal').classList.add('open');
}

function closeRefundInstructions() {
  document.getElementById('refundModal').classList.remove('open');
}

function showRequestSuccess({ number, status = 'pending', message = t('requestUnderReview') }) {
  document.getElementById('successRequestNumber').textContent = number || '-';
  const statusEl = document.getElementById('successRequestStatus');
  statusEl.textContent = statusLabel(status);
  statusEl.className = 'status-pill ' + statusClass(status);
  document.getElementById('successRequestMessage').textContent = message;
  document.getElementById('requestSuccessModal').classList.add('open');
}

function closeRequestSuccess() {
  document.getElementById('requestSuccessModal').classList.remove('open');
}

function viewOrdersFromSuccess() {
  closeRequestSuccess();
  window.location.href = 'orders.html';
}

function calculateSellReturnByStages(soldTokens, sellAmountTokens) {
  if (!sellAmountTokens || sellAmountTokens <= 0) {
    return { grossReturn: 0, spreadFee: 0, exitFee: 0, netReturn: 0, stagesUsed: [] };
  }
  let remaining = sellAmountTokens;
  let currentSold = soldTokens > 0 ? soldTokens : ARBR_CONFIG.totalSupply * 0.01;
  let grossReturn = 0;
  const stagesUsed = [];
  for (let i = ARBR_CONFIG.stages.length - 1; i >= 0; i--) {
    const stage = ARBR_CONFIG.stages[i];
    if (currentSold <= stage.from) continue;
    const tokensAvailableInStage = currentSold - stage.from;
    const tokensHere = Math.min(remaining, tokensAvailableInStage);
    if (tokensHere <= 0) continue;
    const stageReturn = tokensHere * stage.price;
    grossReturn += stageReturn;
    stagesUsed.push({ name: stage.name, tokens: tokensHere, price: stage.price, return: stageReturn });
    currentSold -= tokensHere;
    remaining -= tokensHere;
    if (remaining <= 0) break;
  }
  const spreadFee = grossReturn * ARBR_CONFIG.spreadRate;
  const exitFee = grossReturn * ARBR_CONFIG.exitFeeRate;
  return { grossReturn, spreadFee, exitFee, netReturn: grossReturn - spreadFee - exitFee, stagesUsed };
}

function renderSellSection() {
  const sellContent = document.getElementById('sellContent');
  if (!sellContent || !currentUser) return;
  const balance = Number(currentWallet?.arbr_balance || 0);
  const locked = Number(currentWallet?.locked_arbr || 0);
  const available = Math.max(0, balance - locked);
  sellContent.innerHTML = `
    <div class="antiwhale-box">
      <h4>${currentLang === 'ar' ? 'نموذج احتساب البيع والاسترداد' : 'Sell and redeem calculation model'}</h4>
      <p>${currentLang === 'ar' ? 'يتم احتساب القيمة بشكل تقديري عبر مراحل التسعير المعتمدة مع توضيح الرسوم والقيمة النهائية قبل إرسال الطلب.' : 'The value is estimated through the approved pricing stages, with fees and the final estimated value shown before submission.'}</p>
      <ul>
        <li>${currentLang === 'ar' ? 'عرض القيمة الإجمالية والرسوم بوضوح' : 'Clear gross value and fee breakdown'}</li>
        <li>${currentLang === 'ar' ? 'اعتماد الطلب بعد مراجعة الإدارة وتأكيد البيانات' : 'Approval after admin review and transaction verification'}</li>
        <li>${currentLang === 'ar' ? 'استخدام الرصيد المتاح فقط' : 'Available balance only'}</li>
      </ul>
    </div>
    ${!isVerified() ? `<div class="service-locked">${t('verificationRequired')}</div>` : ''}
    <div class="sell-balances">
      <div class="sell-metric"><small>${currentLang === 'ar' ? 'رصيد ARBR الكلي' : 'Total ARBR balance'}</small><b>${formatNumber(balance)}</b></div>
      <div class="sell-metric"><small>${currentLang === 'ar' ? 'المقفل' : 'Locked'}</small><b>${formatNumber(locked)}</b></div>
      <div class="sell-metric"><small>${currentLang === 'ar' ? 'المتاح للبيع' : 'Available to sell'}</small><b>${formatNumber(available)}</b></div>
    </div>
    <div class="fee-grid">
      <div class="sell-metric"><small>${t('serviceFee')}</small><b>${(ARBR_CONFIG.spreadRate * 100).toFixed(0)}%</b></div>
      <div class="sell-metric"><small>${t('processingFee')}</small><b>${(ARBR_CONFIG.exitFeeRate * 100).toFixed(0)}%</b></div>
      <div class="sell-metric"><small>${currentLang === 'ar' ? 'إجمالي الرسوم' : 'Total fees'}</small><b>${((ARBR_CONFIG.spreadRate + ARBR_CONFIG.exitFeeRate) * 100).toFixed(0)}%</b></div>
    </div>
    <div class="fgroup">
      <label>${currentLang === 'ar' ? 'كمية ARBR المراد معاينتها للبيع' : 'ARBR amount to preview for sale'}</label>
      <input id="sellAmount" type="number" min="1" step="1" max="${available}" placeholder="${currentLang === 'ar' ? 'مثال: 10000' : 'Example: 10000'}" />
    </div>
    <div class="sell-preview">
      <div class="preview-row"><span>${currentLang === 'ar' ? 'الكمية المطلوبة' : 'Requested amount'}</span><span id="sellPrevAmount">-</span></div>
      <div class="preview-row"><span>${t('grossValue')}</span><span id="sellPrevGross">-</span></div>
      <div class="preview-row fee"><span>${t('serviceFee')}</span><span id="sellPrevSpread">-</span></div>
      <div class="preview-row fee"><span>${t('processingFee')}</span><span id="sellPrevExit">-</span></div>
      <div class="preview-row net"><span>${t('estimatedFinalValue')}</span><span id="sellPrevNet">-</span></div>
      <div id="sellWarnings"></div>
    </div>
    <div class="feature-pending"><b>${currentLang === 'ar' ? 'ملاحظة العملية' : 'Transaction note'}</b>${t('sellCalcNote')}</div>
    <button class="btn-primary" type="button" id="submitSellRequest" style="width:100%;padding:14px;margin-top:16px" ${!isVerified() ? 'disabled' : ''}>${t('submitSellRequest')}</button>
  `;
  document.getElementById('sellAmount').addEventListener('input', updateSellPreview);
  document.getElementById('submitSellRequest').addEventListener('click', submitSellRequest);
  updateSellPreview();
  setLanguage(currentLang);
}

function updateSellPreview() {
  const amount = Number(document.getElementById('sellAmount')?.value || 0);
  const available = Math.max(0, Number(currentWallet?.arbr_balance || 0) - Number(currentWallet?.locked_arbr || 0));
  const result = calculateSellReturnByStages(estimatedSoldTokens, amount);
  const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  setText('sellPrevAmount', amount > 0 ? formatNumber(amount, 'ARBR') : '-');
  setText('sellPrevGross', amount > 0 ? formatNumber(result.grossReturn, ARBR_CONFIG.entryCurrency) : '-');
  setText('sellPrevSpread', amount > 0 ? '-' + formatNumber(result.spreadFee, ARBR_CONFIG.entryCurrency) : '-');
  setText('sellPrevExit', amount > 0 ? '-' + formatNumber(result.exitFee, ARBR_CONFIG.entryCurrency) : '-');
  setText('sellPrevNet', amount > 0 ? formatNumber(result.netReturn, ARBR_CONFIG.entryCurrency) : '-');
  const warnings = document.getElementById('sellWarnings');
  if (!warnings) return;
  const items = [];
  if (amount > available) items.push(currentLang === 'ar' ? 'الكمية المطلوبة تتجاوز الرصيد المتاح للبيع.' : 'Requested amount exceeds the available sell balance.');
  if (result.netReturn > ARBR_CONFIG.maxSellPerDay) items.push(currentLang === 'ar' ? 'سيتم توجيه هذا الطلب إلى مسار مراجعة الإدارة التفصيلي.' : 'This request will be routed to the detailed admin review flow.');
  warnings.innerHTML = items.map(item => `<div class="sell-warning">${escapeHtml(item)}</div>`).join('');
}

async function submitSellRequest() {
  if (!currentUser) {
    openModal();
    showToast(t('loginRequired'), 'warning');
    return;
  }
  if (!requireVerifiedService()) return;
  const amount = Number(document.getElementById('sellAmount')?.value || 0);
  const available = Math.max(0, Number(currentWallet?.arbr_balance || 0) - Number(currentWallet?.locked_arbr || 0));
  if (amount <= 0) { showToast(t('invalidAmount'), 'warning'); return; }
  if (amount > available) { showToast(currentLang === 'ar' ? 'الكمية المطلوبة تتجاوز الرصيد المتاح.' : 'Requested amount exceeds available balance.', 'warning'); return; }
  const result = calculateSellReturnByStages(estimatedSoldTokens, amount);
  const btn = document.getElementById('submitSellRequest');
  setBusy(btn, true, t('submittingRequest'));
  const { data, error } = await supabaseClient
    .from('redeem_requests')
    .insert({
      user_id: currentUser.id,
      amount_arbr: amount,
      estimated_gross_omr: result.grossReturn,
      service_fee_omr: result.spreadFee,
      processing_fee_omr: result.exitFee,
      estimated_final_omr: result.netReturn,
      status: 'pending'
    })
    .select('id,status')
    .single();
  setBusy(btn, false);
  if (error) { showToast(t('requestFailed') + ': ' + error.message, 'error'); return; }
  showToast(t('sellSubmitted'), 'success');
  showRequestSuccess({
    number: redeemId(data),
    status: data?.status || 'pending',
    message: t('requestUnderReview')
  });
  document.getElementById('sellAmount').value = '';
  updateSellPreview();
  currentRedeemRequests = await loadRedeemRequests(currentUser);
}

function renderPurchaseRequests() {
  const ordersList = document.getElementById('ordersList');
  if (!ordersList) return;
  if (!currentPurchaseRequests.length) {
    ordersList.innerHTML = `
      <div class="legal-notice" style="margin-bottom:14px" data-i18n="approvedBalanceNotice">${t('approvedBalanceNotice')}</div>
      <div class="empty-orders" data-i18n="noPurchaseRequests">${t('noPurchaseRequests')}</div>
    `;
    setLanguage(currentLang);
    return;
  }
  const recent = currentPurchaseRequests.slice(0, 5);
  ordersList.innerHTML = `
    <div class="legal-notice" style="margin-bottom:14px" data-i18n="approvedBalanceNotice">${t('approvedBalanceNotice')}</div>
    ${renderOrdersTable(recent, false)}
  `;
  bindOrderDetailButtons(ordersList);
  setLanguage(currentLang);
}

function renderOrdersTable(orders, showNote = true) {
  const showProcessedAt = orders.some(order => recordHasColumn(order, 'processed_at'));
  return `
    <div class="orders-table-wrap">
      <table class="orders-table">
        <thead>
          <tr>
            <th>${currentLang === 'ar' ? 'رقم الطلب' : 'Request ID'}</th>
            <th>${currentLang === 'ar' ? 'المبلغ' : 'Amount'}</th>
            <th>${t('paymentMethod')}</th>
            <th>${currentLang === 'ar' ? 'الكمية المقدرة' : 'Estimated amount'}</th>
            <th>${currentLang === 'ar' ? 'الحالة' : 'Status'}</th>
            <th>${currentLang === 'ar' ? 'التاريخ' : 'Date'}</th>
            ${showProcessedAt ? `<th>${currentLang === 'ar' ? 'تاريخ المعالجة' : 'Processed date'}</th>` : ''}
            ${showNote ? `<th>${currentLang === 'ar' ? 'الملاحظة' : 'Note'}</th>` : ''}
          </tr>
        </thead>
        <tbody>
          ${orders.map(order => `
            <tr>
              <td class="req-id"><button class="order-link" type="button" data-order-detail="${order.id}">${requestId(order)}</button></td>
              <td>${formatNumber(requestAmount(order), ARBR_CONFIG.entryCurrency)}</td>
              <td>${escapeHtml(order.payment_method || '-')}</td>
              <td>${formatNumber(requestEstimated(order), 'ARBR')}</td>
              <td><span class="status-pill ${statusClass(order.status)}">${statusLabel(order.status)}</span></td>
              <td>${requestDate(order)}</td>
              ${showProcessedAt ? `<td>${requestProcessedDate(order)}</td>` : ''}
              ${showNote ? `<td>${escapeHtml(order.note || order.admin_notes || order.admin_note || '-')}</td>` : ''}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function bindOrderDetailButtons(scope = document) {
  scope.querySelectorAll('[data-order-detail]').forEach(btn => {
    btn.addEventListener('click', () => openOrderDetails(btn.dataset.orderDetail));
  });
}

function detailItem(label, value, wide = false) {
  const safeLabel = escapeHtml(label);
  const safeValue = escapeHtml(value || '-');
  return `<div class="detail-item ${wide ? 'wide' : ''}"><small>${safeLabel}</small><b>${safeValue}</b></div>`;
}

function openOrderDetails(orderId) {
  const order = currentPurchaseRequests.find(item => String(item.id) === String(orderId));
  if (!order) return;
  const content = document.getElementById('orderDetailsContent');
  const reviewedDate = order.reviewed_at || order.processed_at || order.updated_at;
  content.innerHTML = [
    detailItem(t('requestNumber'), requestId(order)),
    detailItem(t('paymentMethod'), order.payment_method || '-'),
    detailItem(currentLang === 'ar' ? 'المبلغ' : 'Amount', formatNumber(requestAmount(order), ARBR_CONFIG.entryCurrency)),
    detailItem(currentLang === 'ar' ? 'كمية ARBR' : 'ARBR quantity', formatNumber(requestEstimated(order), 'ARBR')),
    detailItem(currentLang === 'ar' ? 'رقم المرجع' : 'Reference number', order.payment_reference || order.reference_number || '-'),
    detailItem(t('walletAddress'), order.wallet_address || order.note || '-'),
    detailItem(currentLang === 'ar' ? 'الحالة' : 'Status', statusLabel(order.status)),
    detailItem(t('createdDate'), requestDate(order)),
    detailItem(t('reviewedDate'), reviewedDate ? new Date(reviewedDate).toLocaleDateString(currentLang === 'ar' ? 'ar' : 'en-US') : '-'),
    detailItem(t('adminNote'), order.admin_notes || order.admin_note || '-', true)
  ].join('');
  document.getElementById('orderDetailsModal').classList.add('open');
}

function closeOrderDetailsModal() {
  document.getElementById('orderDetailsModal').classList.remove('open');
}

function renderAllOrders(filter = activeOrdersFilter) {
  activeOrdersFilter = filter;
  document.querySelectorAll('.orders-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.orderFilter === filter);
  });
  const allOrdersList = document.getElementById('allOrdersList');
  if (!allOrdersList) return;
  const filtered = filter === 'all'
    ? currentPurchaseRequests
    : currentPurchaseRequests.filter(order => order.status === filter);
  if (!filtered.length) {
    allOrdersList.innerHTML = `<div class="empty-orders" data-i18n="noOrdersHere">${t('noOrdersHere')}</div>`;
    setLanguage(currentLang);
    return;
  }
  allOrdersList.innerHTML = renderOrdersTable(filtered, true);
  bindOrderDetailButtons(allOrdersList);
  setLanguage(currentLang);
}

function updateAuthUI() {
  const loggedIn = Boolean(currentUser);
  const headerLoginBtn = document.getElementById('headerLoginBtn');
  const userMenuWrap = document.getElementById('userMenuWrap');
  const adminDashboard = document.getElementById('adminDashboard');
  if (headerLoginBtn) headerLoginBtn.style.display = loggedIn ? 'none' : '';
  if (userMenuWrap) userMenuWrap.classList.toggle('show', loggedIn);
  if (adminDashboard) adminDashboard.classList.toggle('show', loggedIn && isAdminUser() && ARBR_PAGE === 'admin');
  const adminNavItem = document.querySelector('.admin-nav-item');
  if (adminNavItem) adminNavItem.style.display = loggedIn && isAdminUser() ? 'list-item' : 'none';

  if (!loggedIn) {
    document.getElementById('userMenu')?.classList.remove('open');
    renderAdminNotificationBadge();
    setupAdminRealtime();
    return;
  }

  const email = currentProfile?.email || currentUser.email || '-';
  const balance = currentWallet?.arbr_balance || 0;
  const locked = currentWallet?.locked_arbr || 0;
  const totalDeposit = currentWallet?.total_deposit_omr || 0;
  const pendingRequests = currentPurchaseRequests.filter(order => order.status === 'pending').length;
  const name = profileDisplayName();
  const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };

  setText('navUserName', t('greeting', { name }));
  setText('navUserBalance', t('balanceLabel', { amount: formatNumber(balance, 'ARBR') }));
  setText('dashAvatar', (name || 'A').trim().charAt(0).toUpperCase());
  setText('dashFullName', currentProfile?.full_name || currentUser.email?.split('@')[0] || '-');
  setText('dashEmail', email);
  setText('dashPhone', currentProfile?.phone || '-');
  setText('dashArbrBalance', formatNumber(balance, 'ARBR'));
  setText('dashLockedArbr', formatNumber(locked, 'ARBR'));
  setText('dashTotalDeposit', formatNumber(totalDeposit, ARBR_CONFIG.entryCurrency));
  setText('dashTotalRequests', String(currentPurchaseRequests.length));
  setText('dashPendingRequests', String(pendingRequests));
  setText('dashAccountStatus', profileHasColumn('account_status') ? accountStatusLabel(currentProfile.account_status) : t('activeStatus'));
  const dashVerificationStatus = document.getElementById('dashVerificationStatus');
  if (dashVerificationStatus) {
    dashVerificationStatus.innerHTML = `<span class="verification-badge ${verificationClass()}">${verificationLabel()}</span>`;
  }
  updateVerificationRestrictions();
  if (document.getElementById('ordersList')) renderPurchaseRequests();
  if (document.getElementById('allOrdersList')) renderAllOrders(activeOrdersFilter);
  if (document.getElementById('pilotList')) renderPilotDeposits();
  if (document.getElementById('sellContent')) renderSellSection();
  if (ARBR_PAGE === 'admin' && isAdminUser()) {
    loadAdminDashboard();
  } else {
    adminPurchaseRequests = [];
    adminPilotDeposits = [];
    adminSummary = { pendingPurchases: 0, pendingDeposits: 0, totalPending: 0, todayRequests: 0 };
    adminDashboardError = '';
    renderAdminNotificationBadge();
  }
  setupAdminRealtime();
}

async function refreshUserState() {
  await loadPlatformState();
  currentUser = await getCurrentUser();
  if (!currentUser) {
    currentProfile = null;
    currentWallet = null;
    currentPurchaseRequests = [];
    currentPilotDeposits = [];
    currentRedeemRequests = [];
    if (AUTH_REQUIRED_PAGES.has(ARBR_PAGE)) {
      goToLogin(location.pathname.split('/').pop() || 'dashboard.html');
      return;
    }
    updateAuthUI();
    return;
  }
  const [profile, wallet, requests, pilots, redeems] = await Promise.all([
    loadUserProfile(currentUser),
    loadUserWallet(currentUser),
    loadPurchaseRequests(currentUser),
    loadPilotDeposits(currentUser),
    loadRedeemRequests(currentUser)
  ]);
  currentProfile = profile;
  currentWallet = wallet;
  currentPurchaseRequests = requests;
  currentPilotDeposits = pilots;
  currentRedeemRequests = redeems;
  if (ARBR_PAGE === 'login') {
    const next = new URLSearchParams(location.search).get('next') || 'dashboard.html';
    window.location.replace(next);
    return;
  }
  if (ARBR_PAGE === 'admin' && !isAdminUser()) {
    window.location.replace('dashboard.html');
    return;
  }
  updateAuthUI();
}

function openSettings() {
  if (!currentUser) {
    goToLogin('dashboard.html');
    showToast(t('loginRequired'), 'warning');
    return;
  }
  document.getElementById('settingsFullName').value = currentProfile?.full_name || '';
  document.getElementById('settingsPhone').value = currentProfile?.phone || '';
  document.getElementById('settingsPhone').readOnly = true;
  const countrySupported = profileHasColumn('country');
  document.getElementById('settingsCountryGroup').classList.toggle('hidden', !countrySupported);
  document.getElementById('settingsCountry').value = countrySupported ? (currentProfile?.country || '') : '';
  document.getElementById('settingsModal').classList.add('open');
  document.getElementById('userMenu')?.classList.remove('open');
}

function closeSettings() {
  document.getElementById('settingsModal').classList.remove('open');
}

async function saveSettings() {
  if (!currentUser) return;
  const btn = document.getElementById('saveSettingsBtn');
  setBusy(btn, true, t('saving'));
  const updates = {
    full_name: document.getElementById('settingsFullName').value.trim()
  };
  if (profileHasColumn('country')) {
    updates.country = document.getElementById('settingsCountry').value.trim();
  }
  const { error } = await supabaseClient
    .from('profiles')
    .update(updates)
    .eq('id', currentUser.id);
  setBusy(btn, false);
  if (error) {
    showToast(t('settingsSaveFailed') + ': ' + error.message, 'error');
    return;
  }
  showToast(t('settingsSaved'), 'success');
  closeSettings();
  await refreshUserState();
}

async function logoutUser() {
  if (!requireSupabase()) return;
  await supabaseClient.auth.signOut();
  currentUser = null;
  currentProfile = null;
  currentWallet = null;
  currentPurchaseRequests = [];
  currentPilotDeposits = [];
  currentRedeemRequests = [];
  adminPurchaseRequests = [];
  adminPilotDeposits = [];
  adminSummary = { pendingPurchases: 0, pendingDeposits: 0, totalPending: 0, todayRequests: 0 };
  adminDashboardError = '';
  updateAuthUI();
  window.location.href = 'index.html';
  showToast(t('logoutSuccess'));
}

function requireLoginBeforePurchase() {
  if (currentUser) return true;
  goToLogin(location.pathname.split('/').pop() || 'buy.html');
  showToast(t('loginBeforePurchase'), 'warning');
  return false;
}

function openModal() {
  if (ARBR_PAGE === 'login') return;
  goToLogin(location.pathname.split('/').pop() || 'dashboard.html');
}

function closeModal() {
  document.getElementById('loginModal')?.classList.remove('open');
}

function afterAuthSuccess() {
  if (ARBR_PAGE === 'login') {
    const next = new URLSearchParams(location.search).get('next') || 'dashboard.html';
    window.location.href = next;
    return;
  }
  closeModal();
}

function bindLoginPage() {
  const loginTab = document.getElementById('loginTab');
  const signupTab = document.getElementById('signupTab');
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  if (!loginTab || !signupTab) return;
  loginTab.onclick = () => {
    loginTab.classList.add('active'); signupTab.classList.remove('active');
    loginForm.classList.remove('hidden'); signupForm.classList.add('hidden');
  };
  signupTab.onclick = () => {
    signupTab.classList.add('active'); loginTab.classList.remove('active');
    signupForm.classList.remove('hidden'); loginForm.classList.add('hidden');
  };
  document.getElementById('doLogin').onclick = async () => {
    if (!requireSupabase()) return;
    const btn = document.getElementById('doLogin');
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPass').value;
    if (!email) { showToast(t('enterEmail'), 'warning'); return; }
    if (!password) { showToast(t('enterPassword'), 'warning'); return; }
    setBusy(btn, true, t('loggingIn'));
    try {
      const { error } = await withTimeout(
        supabaseClient.auth.signInWithPassword({ email, password }),
        15000,
        t('loginTimeout')
      );
      if (error) { showToast(t('loginFailed') + ': ' + error.message, 'error'); return; }
      await refreshUserState();
      showToast(t('loginSuccess'));
      afterAuthSuccess();
    } catch (error) {
      showToast(error.message || t('loginRetry'), 'error');
    } finally {
      setBusy(btn, false);
    }
  };
  document.getElementById('doSignup').onclick = async () => {
    if (!requireSupabase()) return;
    const btn = document.getElementById('doSignup');
    const fullName = document.getElementById('sName').value.trim();
    const phone = document.getElementById('sPhone').value.trim();
    const email = document.getElementById('sEmail').value.trim();
    const password = document.getElementById('sPass').value;
    if (!fullName) { showToast(t('enterFullName'), 'warning'); return; }
    if (!phone) { showToast(t('enterPhone'), 'warning'); return; }
    if (!email) { showToast(t('enterEmail'), 'warning'); return; }
    if (password.length < 6) { showToast(t('shortPassword'), 'warning'); return; }
    setBusy(btn, true, t('creatingAccount'));
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: 'https://arab-rial.com',
        data: { full_name: fullName, phone }
      }
    });
    setBusy(btn, false);
    if (error) { showToast(t('signupFailed') + ': ' + error.message, 'error'); return; }
    if (data?.session) await supabaseClient.auth.signOut();
    await refreshUserState();
    showToast(t('accountCreated'));
  };
}

function bindBuyPage() {
  const amtInput = document.getElementById('amt');
  const arbResult = document.getElementById('arbResult');
  if (!amtInput || !arbResult) return;
  const calc = () => {
    const v = Math.max(0, Number(amtInput.value || 0));
    arbResult.textContent = formatNumber(v * ARBR_CONFIG.entryTokenRate, 'ARBR');
  };
  amtInput.addEventListener('input', calc);
  calc();
  document.getElementById('submitBuy')?.addEventListener('click', async () => {
    if (!requireSupabase()) return;
    if (!requireLoginBeforePurchase()) return;
    const btn = document.getElementById('submitBuy');
    const note = document.getElementById('wallet').value.trim();
    const amount = Number(amtInput.value);
    const paymentMethod = document.getElementById('payM').value;
    if (!note) { showToast(t('enterWallet'), 'warning'); return; }
    if (amount < 10) { showToast(t('minPurchase'), 'warning'); return; }
    if (amount >= ARBR_CONFIG.largeBuyVerificationAmount && !requireVerifiedService()) return;
    setBusy(btn, true, t('submittingRequest'));
    const { data, error } = await supabaseClient
      .from('purchase_requests')
      .insert({
        user_id: currentUser.id,
        amount_omr: amount,
        amount_usd: amount,
        estimated_arbr: amount * ARBR_CONFIG.entryTokenRate,
        payment_method: paymentMethod,
        wallet_address: note,
        note,
        status: 'pending'
      })
      .select('id,status')
      .single();
    setBusy(btn, false);
    if (error) { showToast(t('requestFailed') + ': ' + error.message, 'error'); return; }
    showToast(t('requestSubmitted'), 'success');
    showRequestSuccess({
      number: requestId(data),
      status: data?.status || 'pending',
      message: t('requestUnderReview')
    });
    currentPurchaseRequests = await loadPurchaseRequests(currentUser);
    updateAuthUI();
    document.getElementById('wallet').value = '';
  });
}

function bindOn(el, event, handler) {
  if (el) el.addEventListener(event, handler);
}

function bindCommonChrome() {
  document.querySelectorAll('[data-open-login]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      openModal();
    });
  });
  const headerLoginBtn = document.getElementById('headerLoginBtn');
  if (headerLoginBtn && headerLoginBtn.tagName === 'A') {
    headerLoginBtn.href = loginUrl();
  }
  bindOn(document.getElementById('userBox'), 'click', () => {
    document.getElementById('userMenu')?.classList.toggle('open');
  });
  document.addEventListener('click', e => {
    const wrap = document.getElementById('userMenuWrap');
    if (wrap && !wrap.contains(e.target)) document.getElementById('userMenu')?.classList.remove('open');
  });
  bindOn(document.getElementById('openSettingsBtn'), 'click', openSettings);
  bindOn(document.getElementById('logoutBtn'), 'click', logoutUser);
  bindOn(document.getElementById('closeSettings'), 'click', closeSettings);
  bindOn(document.getElementById('settingsCloseBtn'), 'click', closeSettings);
  bindOn(document.getElementById('saveSettingsBtn'), 'click', saveSettings);
  bindOn(document.getElementById('settingsModal'), 'click', e => { if (e.target.id === 'settingsModal') closeSettings(); });
  bindOn(document.getElementById('closeSuccessModal'), 'click', closeRequestSuccess);
  bindOn(document.getElementById('successCloseBtn'), 'click', closeRequestSuccess);
  bindOn(document.getElementById('successViewOrders'), 'click', viewOrdersFromSuccess);
  bindOn(document.getElementById('requestSuccessModal'), 'click', e => { if (e.target.id === 'requestSuccessModal') closeRequestSuccess(); });
  bindOn(document.getElementById('closeOrderDetails'), 'click', closeOrderDetailsModal);
  bindOn(document.getElementById('orderDetailsModal'), 'click', e => { if (e.target.id === 'orderDetailsModal') closeOrderDetailsModal(); });
  bindOn(document.getElementById('closeAdminDetails'), 'click', closeAdminDetailsModal);
  bindOn(document.getElementById('adminDetailsCloseBtn'), 'click', closeAdminDetailsModal);
  bindOn(document.getElementById('adminApproveAction'), 'click', e => handleAdminReviewAction(e.currentTarget));
  bindOn(document.getElementById('adminRejectAction'), 'click', e => handleAdminReviewAction(e.currentTarget));
  bindOn(document.getElementById('adminDetailsModal'), 'click', e => { if (e.target.id === 'adminDetailsModal') closeAdminDetailsModal(); });
  bindOn(document.getElementById('adminNotificationBadge'), 'click', () => { window.location.href = 'admin.html'; });
  bindOn(document.getElementById('closeRefund'), 'click', closeRefundInstructions);
  bindOn(document.getElementById('refundOk'), 'click', closeRefundInstructions);
  bindOn(document.getElementById('refundModal'), 'click', e => { if (e.target.id === 'refundModal') closeRefundInstructions(); });
  bindOn(document.getElementById('pilotForm'), 'submit', submitPilotDeposit);
  document.querySelectorAll('.orders-tab').forEach(btn => {
    btn.addEventListener('click', () => renderAllOrders(btn.dataset.orderFilter || 'all'));
  });
  document.querySelectorAll('[data-lang-toggle]').forEach(btn => btn.addEventListener('click', toggleLanguage));
  bindOn(document.getElementById('navToggle'), 'click', () => {
    const open = document.body.classList.toggle('nav-open');
    document.getElementById('navToggle')?.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
}

function initPageBindings() {
  if (ARBR_PAGE === 'login') bindLoginPage();
  if (ARBR_PAGE === 'buy') bindBuyPage();
  if (ARBR_PAGE === 'deposit' || ARBR_PAGE === 'sell' || ARBR_PAGE === 'dashboard') {
    if (document.getElementById('sellContent') && currentUser) renderSellSection();
  }
}

const MODALS_FALLBACK_HTML = `<!-- ══════════ SETTINGS MODAL ══════════ -->
<div class="modal" id="settingsModal">
  <div class="modal-card">
    <button class="modal-close" id="closeSettings">×</button>
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
      <div class="logo-mark" style="width:40px;height:40px"><img src="logo.svg" alt="Arab Rial ARBR logo" /></div>
      <div class="logo-text"><b data-i18n="settings">الإعدادات</b><small data-i18n="investorProfile">Account Profile</small></div>
    </div>
    <div class="fgroup"><label data-i18n="fullName">الاسم الكامل</label><input id="settingsFullName" placeholder="اكتب اسمك الكامل" data-i18n-placeholder="fullNamePlaceholder" /></div>
    <div class="fgroup">
      <label data-i18n="phone">رقم الهاتف</label>
      <input id="settingsPhone" type="tel" placeholder="+..." data-i18n-placeholder="phonePlaceholder" readonly />
      <small class="helper-text" data-i18n="phoneLockedHelp">رقم الهاتف مرتبط بحسابك ولا يمكن تغييره من لوحة المستخدم. لتحديث رقم الهاتف، يرجى التواصل مع إدارة المنصة.</small>
    </div>
    <div class="fgroup hidden" id="settingsCountryGroup"><label data-i18n="country">الدولة</label><input id="settingsCountry" placeholder="مثال: Oman" data-i18n-placeholder="countryPlaceholder" /></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn-primary" style="flex:1;padding:13px" id="saveSettingsBtn" data-i18n="saveChanges">حفظ التغييرات</button>
      <button class="btn-secondary" style="flex:1;padding:13px" id="settingsCloseBtn" data-i18n="close">إغلاق</button>
    </div>
  </div>
</div>
<div class="modal" id="requestSuccessModal">
  <div class="modal-card">
    <button class="modal-close" id="closeSuccessModal">×</button>
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px">
      <div class="logo-mark" style="width:40px;height:40px"><img src="logo.svg" alt="Arab Rial ARBR logo" /></div>
      <div class="logo-text"><b data-i18n="requestConfirmed">تم تأكيد الطلب</b><small>ARBR</small></div>
    </div>
    <div class="success-box">
      <small data-i18n="requestNumber">رقم الطلب</small>
      <b id="successRequestNumber">-</b>
      <span class="status-pill pending" id="successRequestStatus">-</span>
    </div>
    <p class="success-copy" id="successRequestMessage" data-i18n="requestUnderReview">تم إرسال طلبك بنجاح وهو الآن قيد المراجعة.</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:20px">
      <button class="btn-primary" style="flex:1;padding:13px" id="successViewOrders" data-i18n="viewMyOrders">عرض طلباتي</button>
      <button class="btn-secondary" style="flex:1;padding:13px" id="successCloseBtn" data-i18n="close">إغلاق</button>
    </div>
  </div>
</div>
<div class="modal" id="orderDetailsModal">
  <div class="modal-card modal-wide">
    <button class="modal-close" id="closeOrderDetails">×</button>
    <h3 style="color:var(--gold-light);margin-bottom:16px" data-i18n="orderDetails">تفاصيل الطلب</h3>
    <div class="details-grid" id="orderDetailsContent"></div>
  </div>
</div>
<div class="modal" id="adminDetailsModal">
  <div class="modal-card modal-wide">
    <button class="modal-close" id="closeAdminDetails">×</button>
    <h3 style="color:var(--gold-light);margin-bottom:16px" data-i18n="adminDetailsTitle">تفاصيل طلب الإدارة</h3>
    <div class="details-grid" id="adminDetailsContent"></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px">
      <button class="btn-primary" type="button" id="adminApproveAction" data-admin-action="approve" data-i18n="adminApprove">موافقة</button>
      <button class="btn-secondary" type="button" id="adminRejectAction" data-admin-action="reject" data-i18n="adminReject">رفض</button>
      <button class="btn-secondary" type="button" id="adminDetailsCloseBtn" data-i18n="close">إغلاق</button>
    </div>
  </div>
</div>
<div class="modal" id="refundModal">
  <div class="refund-modal-card">
    <button class="modal-close" id="closeRefund">×</button>
    <h3 style="color:var(--gold-light);margin-bottom:12px" data-i18n="refundTitle">طلب استرداد إيداع العضوية</h3>
    <p style="color:var(--muted);font-size:14px;line-height:1.9" data-i18n="refundDesc">لطلب الاسترداد، تواصل مع الإدارة واذكر رقم الطلب.</p>
    <div class="refund-id" id="refundDepositId">-</div>
    <p style="color:var(--muted);font-size:12px;line-height:1.8" data-i18n="refundNote">تتم مراجعة طلبات الاسترداد من الإدارة، وسيتم التواصل معك عبر بيانات الحساب المسجلة.</p>
    <button class="btn-primary" id="refundOk" style="width:100%;padding:12px;margin-top:18px" data-i18n="okUnderstood">حسنًا، فهمت</button>
  </div>
</div>`;

async function loadSharedModals() {
  const host = document.getElementById('shared-modals');
  if (!host || host.querySelector('#settingsModal')) return;
  let html = '';
  try {
    const url = new URL('assets/partials/modals.html', window.location.href);
    const res = await fetch(url);
    if (res.ok) html = await res.text();
  } catch (_) { /* file:// or network */ }
  host.innerHTML = (html && html.trim()) ? html : MODALS_FALLBACK_HTML;
}

async function initArbrApp() {
  try {
    await loadSharedModals();
    bindCommonChrome();
    initPageBindings();
    setLanguage(currentLang);
    await refreshUserState();
    if (supabaseClient) {
      supabaseClient.auth.onAuthStateChange(() => setTimeout(() => refreshUserState(), 0));
    }
  } catch (err) {
    console.error('ARBR init failed:', err);
    showToast?.('تعذر تحميل المنصة. حدّث الصفحة.', 'error');
  }
}

initArbrApp();
