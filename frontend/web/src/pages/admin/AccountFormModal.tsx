import { Store, UserPen } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import Modal from '../../components/Modal'
import { useToast } from '../../components/Toast'
import { createAccount, updateAccount, ValidationError } from '../../services/accountService'
import { INDUSTRIES, type Account, type AccountInput, type Industry } from '../../types'
import { EMAIL_RE, PHONE_RE } from '../../utils/format'

interface Props {
  open: boolean
  account?: Account | null
  onClose: () => void
  onSaved: (acc: Account) => void
}

type Errors = Partial<Record<keyof AccountInput, string>>

const EMPTY: AccountInput = {
  storeName: '',
  ownerName: '',
  phone: '',
  email: '',
  industry: '' as Industry,
  address: '',
  plan: 'basic',
}

function validate(v: AccountInput): Errors {
  const e: Errors = {}
  if (!v.storeName.trim()) e.storeName = 'Vui lòng nhập tên cửa hàng.'
  else if (v.storeName.trim().length < 3) e.storeName = 'Tên cửa hàng quá ngắn.'
  if (!v.ownerName.trim()) e.ownerName = 'Vui lòng nhập họ tên chủ cửa hàng.'
  if (!v.phone) e.phone = 'Vui lòng nhập số điện thoại.'
  else if (!PHONE_RE.test(v.phone)) e.phone = 'Số điện thoại gồm 10 chữ số, bắt đầu bằng 0 (vd: 0901234567).'
  if (v.email && !EMAIL_RE.test(v.email.trim())) e.email = 'Email không hợp lệ.'
  if (!v.industry) e.industry = 'Vui lòng chọn ngành hàng.'
  return e
}

export default function AccountFormModal({ open, account, onClose, onSaved }: Props) {
  const toast = useToast()
  const isEdit = Boolean(account)
  const [values, setValues] = useState<AccountInput>(EMPTY)
  const [errors, setErrors] = useState<Errors>({})
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setValues(
      account
        ? {
            storeName: account.storeName,
            ownerName: account.ownerName,
            phone: account.phone,
            email: account.email ?? '',
            industry: account.industry,
            address: account.address,
            plan: account.plan,
          }
        : EMPTY,
    )
    setErrors({})
    setSubmitted(false)
    setSaving(false)
  }, [open, account])

  function set<K extends keyof AccountInput>(key: K, val: AccountInput[K]) {
    const next = { ...values, [key]: val }
    setValues(next)
    if (submitted) setErrors(validate(next))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    const errs = validate(values)
    setErrors(errs)
    if (Object.keys(errs).length) return
    setSaving(true)
    try {
      const payload = { ...values, email: values.email?.trim() || undefined }
      const saved = account ? await updateAccount(account.id, payload) : await createAccount(payload)
      toast.success(isEdit ? 'Đã lưu thay đổi' : 'Đã thêm tài khoản', saved.storeName)
      onSaved(saved)
    } catch (err) {
      if (err instanceof ValidationError) setErrors(err.fields)
      else toast.error('Không lưu được', err instanceof Error ? err.message : undefined)
    } finally {
      setSaving(false)
    }
  }

  const err = (k: keyof AccountInput) =>
    errors[k] ? (
      <span className="field-error" id={`f-${k}-err`}>
        {errors[k]}
      </span>
    ) : null
  const aria = (k: keyof AccountInput) => ({
    'aria-invalid': Boolean(errors[k]),
    'aria-describedby': errors[k] ? `f-${k}-err` : undefined,
  })

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      title={isEdit ? 'Sửa thông tin tài khoản' : 'Thêm tài khoản'}
      description={isEdit ? account?.storeName : 'Tài khoản mới ở trạng thái “Chờ xác minh” cho tới khi chủ quán nhập OTP.'}
      icon={isEdit ? <UserPen size={20} /> : <Store size={20} />}
      size="md"
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>
            Huỷ
          </button>
          <button type="submit" form="account-form" className="btn btn-primary" disabled={saving}>
            {saving && <span className="spinner" />}
            {isEdit ? 'Lưu thay đổi' : 'Thêm tài khoản'}
          </button>
        </>
      }
    >
      <form id="account-form" className="form-grid" onSubmit={onSubmit} noValidate>
        <div className="field span-2">
          <label htmlFor="f-store">Tên cửa hàng *</label>
          <input
            id="f-store"
            className={`input${errors.storeName ? ' has-error' : ''}`}
            placeholder="VD: Tiệm tạp hoá cô Thỏ"
            value={values.storeName}
            onChange={(e) => set('storeName', e.target.value)}
            {...aria('storeName')}
          />
          {err('storeName')}
        </div>
        <div className="field">
          <label htmlFor="f-owner">Chủ cửa hàng *</label>
          <input
            id="f-owner"
            className={`input${errors.ownerName ? ' has-error' : ''}`}
            placeholder="VD: Nguyễn Thị Lan"
            value={values.ownerName}
            onChange={(e) => set('ownerName', e.target.value)}
            {...aria('ownerName')}
          />
          {err('ownerName')}
        </div>
        <div className="field">
          <label htmlFor="f-phone">Số điện thoại *</label>
          <input
            id="f-phone"
            className={`input${errors.phone ? ' has-error' : ''}`}
            placeholder="0xxxxxxxxx"
            inputMode="numeric"
            maxLength={10}
            value={values.phone}
            onChange={(e) => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
            {...aria('phone')}
          />
          {err('phone') ?? <span className="field-hint">10 chữ số, bắt đầu bằng 0</span>}
        </div>
        <div className="field">
          <label htmlFor="f-email">Email</label>
          <input
            id="f-email"
            type="email"
            className={`input${errors.email ? ' has-error' : ''}`}
            placeholder="Không bắt buộc"
            value={values.email}
            onChange={(e) => set('email', e.target.value)}
            {...aria('email')}
          />
          {err('email')}
        </div>
        <div className="field">
          <label htmlFor="f-industry">Ngành hàng *</label>
          <select
            id="f-industry"
            className={`select${errors.industry ? ' has-error' : ''}`}
            value={values.industry}
            onChange={(e) => set('industry', e.target.value as Industry)}
            {...aria('industry')}
          >
            <option value="" disabled>
              Chọn ngành hàng
            </option>
            {INDUSTRIES.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
          {err('industry')}
        </div>
        <div className="field span-2">
          <label htmlFor="f-address">Địa chỉ</label>
          <input
            id="f-address"
            className="input"
            placeholder="VD: Chợ Bà Chiểu, Bình Thạnh, TP.HCM"
            value={values.address}
            onChange={(e) => set('address', e.target.value)}
          />
        </div>
        <fieldset className="field span-2 plain-fieldset">
          <legend className="field-label">Gói dịch vụ</legend>
          <div className="seg">
            {(['basic', 'pro'] as const).map((p) => (
              <label key={p} className={`seg-item${values.plan === p ? ' is-checked' : ''}`}>
                <input type="radio" name="plan" value={p} checked={values.plan === p} onChange={() => set('plan', p)} />
                {p === 'basic' ? 'Cơ bản · 200 đơn/tháng' : 'Pro · thử nghiệm'}
              </label>
            ))}
          </div>
        </fieldset>
      </form>
    </Modal>
  )
}
