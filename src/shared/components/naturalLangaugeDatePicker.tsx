import * as React from "react"
import { parseDate } from "chrono-node"
import { CalendarIcon } from "lucide-react"

import { Calendar } from "@/components/ui/calendar"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

function formatDate(date: Date | undefined) {
  if (!date) return ""
  return date.toLocaleDateString("en-US", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  })
}

function toISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

export function DatePickerNaturalLanguage({
  id,
  initialDate,
  onDateChange,
  disabled,
}: {
  id?: string
  initialDate?: string
  onDateChange?: (isoDate: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const initialParsed = React.useMemo(() => {
    if (!initialDate) return undefined
    const d = new Date(`${initialDate}T00:00:00`)
    return isNaN(d.getTime()) ? undefined : d
  }, [initialDate])
  const [inputValue, setInputValue] = React.useState(() => formatDate(initialParsed))
  const [date, setDate] = React.useState<Date | undefined>(initialParsed)

  function applyDate(newDate: Date | undefined) {
    setDate(newDate)
    if (newDate) {
      setInputValue(formatDate(newDate))
      onDateChange?.(toISODate(newDate))
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <InputGroup>
        <InputGroupInput
          id={id}
          value={inputValue}
          placeholder="e.g. last Friday, Jan 31"
          disabled={disabled}
          onChange={(e) => {
            setInputValue(e.target.value)
            const parsed = parseDate(e.target.value)
            if (parsed) {
              setDate(parsed)
              onDateChange?.(toISODate(parsed))
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault()
              setOpen(true)
            }
          }}
        />
        <InputGroupAddon align="inline-end">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <InputGroupButton
                variant="ghost"
                size="icon-xs"
                aria-label="Select date"
                disabled={disabled}
              >
                <CalendarIcon />
                <span className="sr-only">Select date</span>
              </InputGroupButton>
            </PopoverTrigger>
            <PopoverContent
              className="w-auto overflow-hidden p-0"
              align="end"
              sideOffset={8}
            >
              <Calendar
                mode="single"
                selected={date}
                captionLayout="dropdown"
                defaultMonth={date}
                onSelect={(d) => {
                  applyDate(d)
                  setOpen(false)
                }}
              />
            </PopoverContent>
          </Popover>
        </InputGroupAddon>
      </InputGroup>
      {date && (
        <p className="text-sm text-muted-foreground px-1">
          {formatDate(date)}
        </p>
      )}
    </div>
  )
}
