import type { SupportedLocale } from "@/core/i18n/locales";

export interface QuickSuggestion {
  id: string;
  label: string;
  query: string;
  icon?: string;
}

export const SUGGESTIONS_BY_LOCALE: Record<SupportedLocale, QuickSuggestion[]> = {
  vi: [
    { id: "nearby", label: "📍 Gần đây", query: "Gợi ý trải nghiệm khám phá gần đây" },
    { id: "day_tour", label: "🗓️ Tour trong ngày", query: "Gợi ý tour trong ngày quanh khu vực này" },
    { id: "guide", label: "🧭 Hướng dẫn viên", query: "Gợi ý hướng dẫn viên bản địa LocalMate trong khu vực" },
    { id: "food", label: "🍲 Ẩm thực bản địa", query: "Gợi ý các món ngon và quán ăn bản địa đặc sắc" },
    { id: "spots", label: "📸 Điểm check-in đẹp", query: "Những địa điểm ngắm cảnh và chụp ảnh đẹp nhất" },
    { id: "culture", label: "🎒 Trải nghiệm văn hóa", query: "Gợi ý các hoạt động trải nghiệm văn hóa truyền thống bản địa" },
    { id: "booking", label: "🤝 Đặt hướng dẫn viên", query: "Tôi muốn tìm và đặt hướng dẫn viên LocalMate đồng hành" },
  ],
  en: [
    { id: "nearby", label: "📍 Nearby", query: "Recommend experiences and discoveries near here" },
    { id: "day_tour", label: "🗓️ Day tours", query: "Recommend day tours in this area" },
    { id: "guide", label: "🧭 Native Guides", query: "Are there any verified English-speaking LocalMate native guides available?" },
    { id: "food", label: "🍲 Local Cuisine", query: "Recommend authentic local specialties and dining spots nearby" },
    { id: "spots", label: "📸 Photo Spots", query: "What are the best viewpoints and photography spots in the area?" },
    { id: "culture", label: "🎒 Cultural Activities", query: "What authentic indigenous cultural activities can I experience here?" },
    { id: "booking", label: "🤝 Book a Guide", query: "I would like to find and book a certified LocalMate guide" },
  ],
  zh: [
    { id: "nearby", label: "📍 附近探索", query: "推荐本区域的特色探索体验" },
    { id: "day_tour", label: "🗓️ 一日游", query: "推荐附近的一日游精选线路" },
    { id: "guide", label: "🧭 当地向导", query: "我想了解本地区的 LocalMate 认证当地向导" },
    { id: "food", label: "🍲 地道美食", query: "附近有哪些值得品尝的地道风味与特色美食？" },
    { id: "spots", label: "📸 打卡机位", query: "推荐附近最出片的自然风光与拍照机位" },
    { id: "culture", label: "🎒 民俗体验", query: "这里有哪些独具特色的民俗文化体验？" },
    { id: "booking", label: "🤝 预约向导", query: "我想预约一位 LocalMate 本地向导陪同旅行" },
  ],
  ko: [
    { id: "nearby", label: "📍 주변 명소", query: "주변의 로컬 체험 및 명소를 추천해 주세요" },
    { id: "day_tour", label: "🗓️ 당일 투어", query: "인근의 알찬 당일 투어를 추천해 주세요" },
    { id: "guide", label: "🧭 로컬 가이드", query: "현지 로컬 가이드(LocalMate) 추천을 받고 싶습니다" },
    { id: "food", label: "🍲 로컬 미식", query: "주변의 맛있는 현지 전통 음식과 추천 맛집을 알려주세요" },
    { id: "spots", label: "📸 포토 스팟", query: "인근에서 가장 멋진 풍경을 담을 수 있는 사진 명소는 어디인가요?" },
    { id: "culture", label: "🎒 문화 체험", query: "이 지역에서 즐길 수 있는 전통 문화 체험을 알려주세요" },
    { id: "booking", label: "🤝 가이드 예약", query: "LocalMate 현지 가이드 예약을 진행하고 싶습니다" },
  ],
  ru: [
    { id: "nearby", label: "📍 Поблизости", query: "Порекомендуйте интересные места и активности поблизости" },
    { id: "day_tour", label: "🗓️ Однодневные туры", query: "Порекомендуйте однодневные туры в этом регионе" },
    { id: "guide", label: "🧭 Местные гиды", query: "Порекомендуйте проверенных местных гидов LocalMate" },
    { id: "food", label: "🍲 Местная кухня", query: "Какие традиционные блюда и аутентичные заведения стоит посетить?" },
    { id: "spots", label: "📸 Красивые виды", query: "Где находятся лучшие панорамные точки и локации для фото?" },
    { id: "culture", label: "🎒 Культурный опыт", query: "Какие традиционные культурные активности доступны в этом регионе?" },
    { id: "booking", label: "🤝 Забронировать гида", query: "Я хочу забронировать местного гида LocalMate для сопровождения" },
  ],
  hi: [
    { id: "nearby", label: "📍 आस-पास", query: "यहाँ के अनोखे अनुभव और पर्यटन स्थल सुझाएं" },
    { id: "day_tour", label: "🗓️ एक-दिवसीय यात्रा", query: "इस क्षेत्र में बेहतरीन एक-दिवसीय यात्रा सुझाएं" },
    { id: "guide", label: "🧭 स्थानीय गाइड", query: "क्या यहाँ प्रमाणित LocalMate स्थानीय गाइड उपलब्ध हैं?" },
    { id: "food", label: "🍲 स्थानीय भोजन", query: "यहाँ के प्रसिद्ध पारंपरिक व्यंजन और भोजन स्थल सुझाएं" },
    { id: "spots", label: "📸 दर्शनीय स्थल", query: "आस-पास के सबसे सुंदर दृश्य और फोटो स्थल कौन से हैं?" },
    { id: "culture", label: "🎒 सांस्कृतिक अनुभव", query: "यहाँ कौन-से पारंपरिक और सांस्कृतिक अनुभव उपलब्ध हैं?" },
    { id: "booking", label: "🤝 गाइड बुक करें", query: "मैं एक प्रमाणित LocalMate गाइड बुक करना चाहता हूँ" },
  ],
};

export interface ChatUiText {
  teaserTag: string;
  teaserTitle: string;
  teaserDesc: string;
  readyText: string;
  bannerText: string;
  typing: string;
  suggestionsTitle: string;
  suggestionsScroll: string;
  placeholder: string;
  sendAria: string;
  closeAria: string;
  teaserAria: string;
  dismissTeaserAria: string;
  openAria: string;
  selectLanguageAria: string;
}

export const CHAT_UI_TEXT_BY_LOCALE: Record<SupportedLocale, ChatUiText> = {
  vi: {
    teaserTag: "✨ Trợ lý LocalMate",
    teaserTitle: "Cần gợi ý du lịch & hướng dẫn viên?",
    teaserDesc: "Em có thể gợi ý các tour trải nghiệm bản địa độc đáo, ẩm thực và kết nối hướng dẫn viên LocalMate cho Quý khách!",
    readyText: "Trực tuyến",
    bannerText: "Trợ lý du lịch bản địa & Hướng dẫn viên LocalMate",
    typing: "LocalMate đang soạn câu trả lời...",
    suggestionsTitle: "Gợi ý nhanh cho Quý khách:",
    suggestionsScroll: "Vuốt ngang xem thêm",
    placeholder: "Hỏi về tour trải nghiệm, hướng dẫn viên LocalMate, văn hóa ẩm thực...",
    sendAria: "Gửi tin nhắn",
    closeAria: "Thu nhỏ hộp chat",
    teaserAria: "Tin nhắn tư vấn từ LocalMate AI",
    dismissTeaserAria: "Đóng tin nhắn",
    openAria: "Mở hộp chat trợ lý du lịch bản địa LocalMate AI",
    selectLanguageAria: "Chọn ngôn ngữ",
  },
  en: {
    teaserTag: "✨ LocalMate AI",
    teaserTitle: "Need local travel tips & guides?",
    teaserDesc: "I can suggest authentic local tours, cultural spots, and connect you with native LocalMate guides!",
    readyText: "Online",
    bannerText: "Native Travel & LocalMate Guide Assistant",
    typing: "LocalMate is composing an answer...",
    suggestionsTitle: "Quick suggestions:",
    suggestionsScroll: "Swipe horizontally",
    placeholder: "Ask about tours, guides, local food, culture...",
    sendAria: "Send message",
    closeAria: "Minimize chat",
    teaserAria: "Travel advice message from LocalMate AI",
    dismissTeaserAria: "Dismiss message",
    openAria: "Open LocalMate AI travel assistant chat",
    selectLanguageAria: "Select language",
  },
  zh: {
    teaserTag: "✨ LocalMate 助理",
    teaserTitle: "需要旅行建议或当地向导推荐吗？",
    teaserDesc: "我可以为您推荐特色原生态路线、地道美食，或对接认证 LocalMate 当地向导！",
    readyText: "在线",
    bannerText: "原生旅游助理 & LocalMate 向导咨询",
    typing: "LocalMate 正在撰写回复...",
    suggestionsTitle: "为您推荐的快速提问：",
    suggestionsScroll: "左右滑动查看更多",
    placeholder: "咨询特色线路、LocalMate 向导、风土人情...",
    sendAria: "发送消息",
    closeAria: "收起聊天窗口",
    teaserAria: "来自 LocalMate AI 的咨询消息",
    dismissTeaserAria: "关闭消息",
    openAria: "打开 LocalMate AI 旅游助手对话窗口",
    selectLanguageAria: "选择语言",
  },
  ko: {
    teaserTag: "✨ LocalMate AI",
    teaserTitle: "현지 여행 추천이나 가이드가 필요하신가요?",
    teaserDesc: "맞춤 로컬 투어 추천, 고유 문화 체험 및 인증된 LocalMate 가이드 연결을 도와드립니다!",
    readyText: "온라인",
    bannerText: "현지 여행 비서 & LocalMate 가이드 연결",
    typing: "LocalMate가 답변 작성 중...",
    suggestionsTitle: "빠른 질문 선택:",
    suggestionsScroll: "가로로 스크롤하여 더 보기",
    placeholder: "투어 일정, LocalMate 가이드, 지역 명소 문의...",
    sendAria: "메시지 전송",
    closeAria: "채팅 닫기",
    teaserAria: "LocalMate AI의 여행 안내 메시지",
    dismissTeaserAria: "메시지 닫기",
    openAria: "LocalMate AI 현지 여행 비서 채팅 열기",
    selectLanguageAria: "언어 선택",
  },
  ru: {
    teaserTag: "✨ LocalMate AI",
    teaserTitle: "Нужен совет по турам или местный гид?",
    teaserDesc: "Помогу подобрать аутентичный маршрут, познакомиться с местной культурой и найти гида LocalMate!",
    readyText: "В сети",
    bannerText: "Гид по местным путешествиям & LocalMate",
    typing: "LocalMate печатает ответ...",
    suggestionsTitle: "Быстрые подсказки:",
    suggestionsScroll: "Прокрутите для просмотра",
    placeholder: "Спросите о турах, гидах LocalMate, традициях...",
    sendAria: "Отправить сообщение",
    closeAria: "Закрыть чат",
    teaserAria: "Сообщение от LocalMate AI",
    dismissTeaserAria: "Закрыть сообщение",
    openAria: "Открыть чат с ассистентом LocalMate AI",
    selectLanguageAria: "Выбрать язык",
  },
  hi: {
    teaserTag: "✨ LocalMate AI",
    teaserTitle: "स्थानीय यात्रा या गाइड की सलाह चाहिए?",
    teaserDesc: "मैं आपको प्रामाणिक स्थानीय यात्राएं, सांस्कृतिक अनुभव और LocalMate गाइड सुझा सकता हूँ!",
    readyText: "ऑनलाइन",
    bannerText: "स्थानीय यात्रा सहायक और LocalMate गाइड",
    typing: "LocalMate उत्तर लिख रहा है...",
    suggestionsTitle: "त्वरित सुझाव:",
    suggestionsScroll: "अधिक देखने के लिए स्वाइप करें",
    placeholder: "टूर, LocalMate गाइड या स्थानीय संस्कृति के बारे में पूछें...",
    sendAria: "संदेश भेजें",
    closeAria: "चैट बंद करें",
    teaserAria: "LocalMate AI से यात्रा सलाह संदेश",
    dismissTeaserAria: "संदेश बंद करें",
    openAria: "LocalMate AI स्थानीय यात्रा सहायक चैट खोलें",
    selectLanguageAria: "भाषा चुनें",
  },
};

export function getLocalMateChatUiText(locale: SupportedLocale): ChatUiText {
  return CHAT_UI_TEXT_BY_LOCALE[locale] ?? CHAT_UI_TEXT_BY_LOCALE.vi;
}

export function getLocalMateWelcomeMessage(locale: SupportedLocale, guestName?: string): string {
  const name = guestName ? ` ${guestName}` : "";
  switch (locale) {
    case "en":
      return `Hello${name}! I'm **LocalMate AI**. 🌿\n\nI'm ready 24/7 to assist you with local travel itineraries, authentic regional experiences, and native guide connections. Where would you like to explore today?`;
    case "zh":
      return `您好${name}！我是 **LocalMate AI** 原生旅游助理。🌿\n\n我全天候 24/7 为您提供当地特色体验线路、风土人情及认证向导预约推荐。今天有什么旅行计划需要我协助的吗？`;
    case "ko":
      return `안녕하세요${name}님! **LocalMate AI** 현지 여행 비서입니다. 🌿\n\n현지 여행 일정, 맞춤 문화 체험 및 로컬 가이드 연결을 24시간 지원해 드립니다. 오늘 어떤 여행 정보를 찾아드릴까요?`;
    case "ru":
      return `Здравствуйте${name}! Я **LocalMate AI** — ваш персональный гид по местным путешествиям. 🌿\n\nЯ готов круглосуточно помочь вам с уникальными маршрутами, аутентичными впечатлениями и подбором местных гидов LocalMate. Куда бы вы хотели отправиться сегодня?`;
    case "hi":
      return `नमस्ते${name}! मैं **LocalMate AI** — आपका स्थानीय यात्रा सहायक हूँ। 🌿\n\nस्थानीय पर्यटन स्थलों, सांस्कृतिक अनुभवों और LocalMate गाइड से जुड़ने के लिए मैं 24/7 उपलब्ध हूँ। आज आपकी यात्रा में क्या मदद करूँ?`;
    default:
      return `Dạ xin chào${name}! Em là **LocalMate AI** — Trợ lý du lịch bản địa của Quý khách. 🌿\n\nEm luôn sẵn sàng hỗ trợ Quý khách 24/7 về các tour khám phá, trải nghiệm văn hóa ẩm thực đặc sắc và kết nối hướng dẫn viên bản địa LocalMate. Quý khách muốn khám phá điều gì hôm nay ạ?`;
  }
}

export function getLocalMateNetworkErrorReply(locale: SupportedLocale): string {
  switch (locale) {
    case "en":
      return "LocalMate AI is temporarily unavailable or reconnecting. Please try again shortly or contact support! ✨";
    case "zh":
      return "网络服务暂时连接中，请稍后重试或联系客服人员！✨";
    case "ko":
      return "현재 네트워크 연결 중입니다. 잠시 후 다시 시도해 주세요! ✨";
    case "ru":
      return "Связь временно недоступна. Пожалуйста, повторите попытку через минуту! ✨";
    case "hi":
      return "नेटवर्क सेवा वर्तमान में अनुपलब्ध है। कृपया थोड़ी देर बाद पुनः प्रयास करें! ✨";
    default:
      return "Dạ kết nối tới trợ lý LocalMate đang được tối ưu trong giây lát. Quý khách vui lòng thử lại sau ít phút nhé! ✨";
  }
}

export interface PublicChatCopy {
  openFabAria: string;
  closeChatAria: string;
  dialogAria: string;
  titleDiscovery: string;
  titleConfirm: string;
  titlePayment: string;
  titleGuideDefault: string;
  statusOnline: string;
  statusConnecting: string;
  locationDefaultSubtitle: string;
  changeLocation: string;
  newDiscovery: string;
  backToDiscoveryAria: string;
  activeOrderNoticePrefix: string;
  openOrderChat: string;
  selectedProposalPrefix: string;
  showAlternatives: string;
  askLocationFallback: string;
  initialQuery: string;
  locationSelectPrompt: string;
  searchLocationPlaceholder: string;
  popularDestinations: string;
  provincesHeader: string;
  confirmBookingButton: string;
  selectProposalFirstError: string;
  selectGuideFirstError: string;
  nameRequiredError: string;
  phoneRequiredError: string;
  phoneFormatError: string;
  orderInitError: string;
  guideMessagePlaceholder: string;
  sendMessageAria: string;
  sendMessageBtn: string;
  sendingText: string;
  sentText: string;
  sendFailedText: string;
  retryText: string;
  orderCompletedText: string;
}

export const PUBLIC_CHAT_COPY_BY_LOCALE: Record<SupportedLocale, PublicChatCopy> = {
  vi: {
    openFabAria: "Mở LocalMate AI tư vấn du lịch bản địa",
    closeChatAria: "Đóng LocalMate AI",
    dialogAria: "LocalMate AI tư vấn du lịch bản địa",
    titleDiscovery: "LocalMate AI",
    titleConfirm: "Xác nhận đặt tour",
    titlePayment: "Thanh toán Stripe",
    titleGuideDefault: "Hướng dẫn viên bản địa",
    statusOnline: "Trực tuyến",
    statusConnecting: "Đang kết nối",
    locationDefaultSubtitle: "Tri thức du lịch bản địa",
    changeLocation: "Đổi vị trí",
    newDiscovery: "Khám phá mới",
    backToDiscoveryAria: "Quay lại khám phá",
    activeOrderNoticePrefix: "Quý khách đang có phiên trò chuyện cho đơn",
    openOrderChat: "Vào khung chat",
    selectedProposalPrefix: "Lịch trình đã chọn",
    showAlternatives: "Xem lịch trình khác",
    askLocationFallback: "Dạ Quý khách muốn em tư vấn cho khu vực nào ạ? Vui lòng chọn bên dưới hoặc nhập quận, thành phố, tỉnh mới.",
    initialQuery: "Gợi ý các địa danh và trải nghiệm nổi bật gần đây",
    locationSelectPrompt: "Chọn điểm đến để bắt đầu:",
    searchLocationPlaceholder: "Tìm tỉnh thành, điểm du lịch...",
    popularDestinations: "Điểm đến thịnh hành",
    provincesHeader: "Tất cả tỉnh thành",
    confirmBookingButton: "Tiến hành đặt & Thanh toán",
    selectProposalFirstError: "Vui lòng chọn lịch trình trước khi chọn hướng dẫn viên.",
    selectGuideFirstError: "Cần chọn cả lịch trình và hướng dẫn viên trước khi đặt tour.",
    nameRequiredError: "Vui lòng nhập họ và tên của Quý khách (tối thiểu 2 ký tự)",
    phoneRequiredError: "Vui lòng nhập số điện thoại liên hệ.",
    phoneFormatError: "Số điện thoại không đúng định dạng. Vui lòng kiểm tra lại.",
    orderInitError: "Không thể khởi tạo đơn hàng. Vui lòng thử lại.",
    guideMessagePlaceholder: "Nhắn tin cho hướng dẫn viên...",
    sendMessageAria: "Gửi tin nhắn",
    sendMessageBtn: "Gửi",
    sendingText: "Đang gửi...",
    sentText: "Đã gửi",
    sendFailedText: "Gửi thất bại",
    retryText: "Thử lại",
    orderCompletedText: "Cuộc trò chuyện của đơn hàng này đã hoàn thành và kết thúc.",
  },
  en: {
    openFabAria: "Open LocalMate AI travel assistant",
    closeChatAria: "Close LocalMate AI",
    dialogAria: "LocalMate AI indigenous travel assistant",
    titleDiscovery: "LocalMate AI",
    titleConfirm: "Confirm Tour Booking",
    titlePayment: "Stripe Payment",
    titleGuideDefault: "Native Local Guide",
    statusOnline: "Online",
    statusConnecting: "Connecting",
    locationDefaultSubtitle: "Indigenous Travel Intelligence",
    changeLocation: "Change location",
    newDiscovery: "New discovery",
    backToDiscoveryAria: "Back to discovery",
    activeOrderNoticePrefix: "You have an active conversation for order",
    openOrderChat: "Open chat",
    selectedProposalPrefix: "Selected itinerary",
    showAlternatives: "View alternatives",
    askLocationFallback: "Which area would you like to explore? Please choose below or enter a city or province.",
    initialQuery: "Recommend top highlights and authentic experiences near here",
    locationSelectPrompt: "Choose a destination to get started:",
    searchLocationPlaceholder: "Search city, province, destination...",
    popularDestinations: "Popular destinations",
    provincesHeader: "All provinces",
    confirmBookingButton: "Proceed to Payment",
    selectProposalFirstError: "Please choose an itinerary before selecting a guide.",
    selectGuideFirstError: "Both itinerary and guide must be selected before booking.",
    nameRequiredError: "Please enter your full name (at least 2 characters).",
    phoneRequiredError: "Please enter your contact phone number.",
    phoneFormatError: "Invalid phone number format. Please check and try again.",
    orderInitError: "Unable to create order. Please try again.",
    guideMessagePlaceholder: "Message the local guide...",
    sendMessageAria: "Send message",
    sendMessageBtn: "Send",
    sendingText: "Sending...",
    sentText: "Sent",
    sendFailedText: "Failed to send",
    retryText: "Retry",
    orderCompletedText: "This tour order conversation has concluded.",
  },
  zh: {
    openFabAria: "打开 LocalMate AI 旅游助手",
    closeChatAria: "关闭 LocalMate AI",
    dialogAria: "LocalMate AI 原生旅游咨询助手",
    titleDiscovery: "LocalMate AI",
    titleConfirm: "确认行程预约",
    titlePayment: "Stripe 支付",
    titleGuideDefault: "当地认证向导",
    statusOnline: "在线",
    statusConnecting: "正在连接",
    locationDefaultSubtitle: "原生态旅游智慧",
    changeLocation: "更改目的地",
    newDiscovery: "重新探索",
    backToDiscoveryAria: "返回探索",
    activeOrderNoticePrefix: "您有当前订单的对话会话",
    openOrderChat: "进入对话",
    selectedProposalPrefix: "已选线路",
    showAlternatives: "查看其他线路",
    askLocationFallback: "请问您想探索哪个地区？请在下方选择或输入城市、省份。",
    initialQuery: "推荐附近的精选景点与原生态体验",
    locationSelectPrompt: "选择目的地以开始探索：",
    searchLocationPlaceholder: "搜索城市、省份、景点...",
    popularDestinations: "热门目的地",
    provincesHeader: "所有省份",
    confirmBookingButton: "前往支付",
    selectProposalFirstError: "请在选择向导前先选择行程线路。",
    selectGuideFirstError: "预约前需同时确认行程线路与当地向导。",
    nameRequiredError: "请输入您的姓名（至少2个字符）。",
    phoneRequiredError: "请输入您的联系电话。",
    phoneFormatError: "电话号码格式无效，请核对后再试。",
    orderInitError: "无法创建订单，请稍后再试。",
    guideMessagePlaceholder: "向当地向导发送消息...",
    sendMessageAria: "发送消息",
    sendMessageBtn: "发送",
    sendingText: "发送中...",
    sentText: "已发送",
    sendFailedText: "发送失败",
    retryText: "重试",
    orderCompletedText: "本次行程订单对话已圆满结束。",
  },
  ko: {
    openFabAria: "LocalMate AI 여행 비서 열기",
    closeChatAria: "LocalMate AI 닫기",
    dialogAria: "LocalMate AI 현지 여행 비서",
    titleDiscovery: "LocalMate AI",
    titleConfirm: "투어 예약 확인",
    titlePayment: "Stripe 결제",
    titleGuideDefault: "현지 로컬 가이드",
    statusOnline: "온라인",
    statusConnecting: "연결 중",
    locationDefaultSubtitle: "현지 로컬 여행 가이드",
    changeLocation: "위치 변경",
    newDiscovery: "새 탐색",
    backToDiscoveryAria: "탐색으로 돌아가기",
    activeOrderNoticePrefix: "진행 중인 주문 대화가 있습니다:",
    openOrderChat: "채팅방 입장",
    selectedProposalPrefix: "선택된 일정",
    showAlternatives: "다른 일정 보기",
    askLocationFallback: "어느 지역을 둘러보고 싶으신가요? 아래에서 선택하거나 도시/지역을 입력해 주세요.",
    initialQuery: "인근 추천 명소와 로컬 체험을 알려주세요",
    locationSelectPrompt: "시작할 여행지를 선택하세요:",
    searchLocationPlaceholder: "도시, 지역, 여행지 검색...",
    popularDestinations: "인기 여행지",
    provincesHeader: "전체 지역",
    confirmBookingButton: "예약 및 결제 진행",
    selectProposalFirstError: "가이드를 선택하기 전에 먼저 일정을 선택해 주세요.",
    selectGuideFirstError: "예약 전 일정과 가이드를 모두 선택해야 합니다.",
    nameRequiredError: "고객님의 성함을 입력해 주세요 (최소 2자).",
    phoneRequiredError: "연락처 전화번호를 입력해 주세요.",
    phoneFormatError: "전화번호 형식이 올바르지 않습니다. 다시 확인해 주세요.",
    orderInitError: "주문을 생성할 수 없습니다. 다시 시도해 주세요.",
    guideMessagePlaceholder: "가이드에게 메시지 보내기...",
    sendMessageAria: "메시지 전송",
    sendMessageBtn: "전송",
    sendingText: "전송 중...",
    sentText: "전송됨",
    sendFailedText: "전송 실패",
    retryText: "재시도",
    orderCompletedText: "이 주문에 대한 대화가 종료되었습니다.",
  },
  ru: {
    openFabAria: "Открыть LocalMate AI гид",
    closeChatAria: "Закрыть LocalMate AI",
    dialogAria: "LocalMate AI персональный гид",
    titleDiscovery: "LocalMate AI",
    titleConfirm: "Подтверждение бронирования",
    titlePayment: "Оплата Stripe",
    titleGuideDefault: "Местный гид",
    statusOnline: "В сети",
    statusConnecting: "Подключение",
    locationDefaultSubtitle: "Местная туристическая экспертиза",
    changeLocation: "Сменить локацию",
    newDiscovery: "Новый поиск",
    backToDiscoveryAria: "Назад к поиску",
    activeOrderNoticePrefix: "У вас есть активный диалог по заказу",
    openOrderChat: "Открыть чат",
    selectedProposalPrefix: "Выбранный маршрут",
    showAlternatives: "Другие варианты",
    askLocationFallback: "Какой регион вы хотите исследовать? Выберите ниже или введите город/провинцию.",
    initialQuery: "Порекомендуйте интересные места и активности поблизости",
    locationSelectPrompt: "Выберите направление для начала:",
    searchLocationPlaceholder: "Поиск по городу, региону...",
    popularDestinations: "Популярные направления",
    provincesHeader: "Все регионы",
    confirmBookingButton: "Перейти к оплате",
    selectProposalFirstError: "Пожалуйста, сначала выберите маршрут.",
    selectGuideFirstError: "Необходимо выбрать маршрут и гида перед бронированием.",
    nameRequiredError: "Пожалуйста, укажите имя (минимум 2 символа).",
    phoneRequiredError: "Пожалуйста, укажите контактный номер телефона.",
    phoneFormatError: "Неверный формат номера телефона. Пожалуйста, проверьте номер.",
    orderInitError: "Не удалось создать заказ. Попробуйте еще раз.",
    guideMessagePlaceholder: "Сообщение гиду...",
    sendMessageAria: "Отправить сообщение",
    sendMessageBtn: "Отправить",
    sendingText: "Отправка...",
    sentText: "Отправлено",
    sendFailedText: "Ошибка отправки",
    retryText: "Повторить",
    orderCompletedText: "Диалог по этому заказу завершен.",
  },
  hi: {
    openFabAria: "LocalMate AI यात्रा सहायक खोलें",
    closeChatAria: "LocalMate AI बंद करें",
    dialogAria: "LocalMate AI स्थानीय यात्रा सहायक",
    titleDiscovery: "LocalMate AI",
    titleConfirm: "टूर बुकिंग की पुष्टि",
    titlePayment: "Stripe भुगतान",
    titleGuideDefault: "स्थानीय गाइड",
    statusOnline: "ऑनलाइन",
    statusConnecting: "कनेक्ट हो रहा है",
    locationDefaultSubtitle: "स्थानीय यात्रा ज्ञान",
    changeLocation: "स्थान बदलें",
    newDiscovery: "नई खोज",
    backToDiscoveryAria: "खोज पर वापस जाएं",
    activeOrderNoticePrefix: "आपके ऑर्डर के लिए सक्रिय चैट है",
    openOrderChat: "चैट खोलें",
    selectedProposalPrefix: "चुना गया यात्रा कार्यक्रम",
    showAlternatives: "अन्य विकल्प देखें",
    askLocationFallback: "आप किस क्षेत्र की यात्रा करना चाहते हैं? कृपया नीचे से चुनें या शहर/राज्य दर्ज करें।",
    initialQuery: "आस-पास के मुख्य आकर्षण और प्रामाणिक अनुभव सुझाएं",
    locationSelectPrompt: "शुरू करने के लिए एक गंतव्य चुनें:",
    searchLocationPlaceholder: "शहर, राज्य, गंतव्य खोजें...",
    popularDestinations: "लोकप्रिय गंतव्य",
    provincesHeader: "सभी राज्य",
    confirmBookingButton: "भुगतान के लिए आगे बढ़ें",
    selectProposalFirstError: "कृपया गाइड चुनने से पहले यात्रा कार्यक्रम चुनें।",
    selectGuideFirstError: "बुकिंग से पहले यात्रा कार्यक्रम और गाइड दोनों चुनना आवश्यक है।",
    nameRequiredError: "कृपया अपना पूरा नाम दर्ज करें (कम से कम 2 अक्षर)।",
    phoneRequiredError: "कृपया अपना संपर्क फ़ोन नंबर दर्ज करें।",
    phoneFormatError: "अमान्य फ़ोन नंबर प्रारूप। कृपया जांच कर पुनः प्रयास करें।",
    orderInitError: "ऑर्डर बनाने में असमर्थ। कृपया पुनः प्रयास करें।",
    guideMessagePlaceholder: "स्थानीय गाइड को संदेश भेजें...",
    sendMessageAria: "संदेश भेजें",
    sendMessageBtn: "भेजें",
    sendingText: "भेज रहा है...",
    sentText: "भेजा गया",
    sendFailedText: "भेजने में विफल",
    retryText: "पुनः प्रयास करें",
    orderCompletedText: "इस टूर ऑर्डर की बातचीत समाप्त हो गई है।",
  },
};

export function getLocalMatePublicCopy(locale: SupportedLocale): PublicChatCopy {
  return PUBLIC_CHAT_COPY_BY_LOCALE[locale] ?? PUBLIC_CHAT_COPY_BY_LOCALE.vi;
}
