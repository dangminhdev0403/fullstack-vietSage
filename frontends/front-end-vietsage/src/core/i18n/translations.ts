export const DEFAULT_LOCALE = "vi" as const;

export type Locale = typeof DEFAULT_LOCALE;

export type TranslationKey =
  | "errors.business.NO_ACTIVE_STAY"
  | "errors.business.QR_EXPIRED"
  | "errors.business.QR_REVOKED"
  | "errors.business.ACCESS_CLOSED"
  | "errors.business.GUEST_SESSION_LIMIT_REACHED"
  | "errors.business.VALIDATION_FAILED"
  | "errors.http.400"
  | "errors.http.401"
  | "errors.http.403"
  | "errors.http.404"
  | "errors.http.409"
  | "errors.http.422"
  | "errors.http.429"
  | "errors.http.500"
  | "errors.http.default"
  | "errors.network"
  | "errors.server"
  | "guest.emergency.eyebrow"
  | "guest.emergency.title"
  | "guest.emergency.description"
  | "guest.emergency.submit"
  | "guest.emergency.submitting"
  | "guest.emergency.success"
  | "guest.emergency.retry"
  | "guest.emergency.contactHotel";

type TranslationValues = Record<string, string | number>;

type TranslationDictionary = Record<TranslationKey, string>;

const vi: TranslationDictionary = {
  "errors.business.NO_ACTIVE_STAY":
    "Phòng hiện chưa có lượt lưu trú đang hoạt động. Quý khách vui lòng liên hệ lễ tân để được hỗ trợ mở quyền truy cập.",
  "errors.business.QR_EXPIRED":
    "Mã QR này đã hết hạn sử dụng. Quý khách vui lòng quét mã QR mới hoặc liên hệ lễ tân.",
  "errors.business.QR_REVOKED":
    "Mã QR này hiện không còn khả dụng. Quý khách vui lòng liên hệ lễ tân để nhận mã mới.",
  "errors.business.ACCESS_CLOSED":
    "Dịch vụ hiện chưa khả dụng cho phòng này. Quý khách vui lòng liên hệ lễ tân để được hỗ trợ.",
  "errors.business.GUEST_SESSION_LIMIT_REACHED":
    "Phòng này đã đạt số lượng thiết bị truy cập tối đa. Quý khách vui lòng dùng thiết bị đã đăng nhập hoặc liên hệ lễ tân.",
  "errors.business.VALIDATION_FAILED":
    "Thông tin gửi lên chưa hợp lệ. Quý khách vui lòng kiểm tra lại và thử lần nữa.",
  "errors.http.400": "Yêu cầu chưa hợp lệ. Quý khách vui lòng kiểm tra thông tin và thử lại.",
  "errors.http.401": "Phiên làm việc đã hết hạn. Vui lòng quét lại mã QR.",
  "errors.http.403": "Quý khách không có quyền thực hiện thao tác này. Vui lòng liên hệ lễ tân nếu cần hỗ trợ.",
  "errors.http.404": "Không tìm thấy dữ liệu yêu cầu. Quý khách vui lòng thử lại hoặc liên hệ lễ tân.",
  "errors.http.409": "Dữ liệu đã thay đổi. Quý khách vui lòng tải lại trang và thử lần nữa.",
  "errors.http.422": "Thông tin gửi lên chưa hợp lệ. Quý khách vui lòng kiểm tra lại và thử lần nữa.",
  "errors.http.429": "Hệ thống đang nhận quá nhiều yêu cầu. Quý khách vui lòng chờ một chút rồi thử lại.",
  "errors.http.500": "Đã xảy ra sự cố. Vui lòng thử lại sau hoặc liên hệ lễ tân nếu cần hỗ trợ ngay.",
  "errors.http.default": "Yêu cầu chưa được xử lý. Quý khách vui lòng thử lại hoặc liên hệ lễ tân.",
  "errors.network": "Không thể kết nối tới máy chủ. Vui lòng kiểm tra kết nối Internet rồi thử lại.",
  "errors.server": "Đã xảy ra sự cố. Vui lòng thử lại sau hoặc liên hệ lễ tân nếu cần hỗ trợ ngay.",
  "guest.emergency.eyebrow": "Khẩn cấp",
  "guest.emergency.title": "Gọi hỗ trợ khẩn cấp",
  "guest.emergency.description":
    "Hệ thống sẽ ghi nhận từng cuộc gọi riêng, gắn với phòng hiện tại và thông báo cho đội vận hành khách sạn.",
  "guest.emergency.submit": "Gọi 112",
  "guest.emergency.submitting": "Đang gửi...",
  "guest.emergency.success":
    "Đã ghi nhận cuộc gọi #{callId} trong sự cố #{incidentId}. Mức độ hiện tại: {severity}.",
  "guest.emergency.retry": "Thử lại",
  "guest.emergency.contactHotel": "Liên hệ lễ tân",
};

const dictionaries: Record<Locale, TranslationDictionary> = { vi };

export function translate(
  key: TranslationKey,
  values: TranslationValues = {},
  locale: Locale = DEFAULT_LOCALE,
): string {
  const template = dictionaries[locale][key] ?? dictionaries[DEFAULT_LOCALE][key];
  return template.replace(/\{(\w+)\}/g, (_, valueKey: string) => String(values[valueKey] ?? ""));
}
