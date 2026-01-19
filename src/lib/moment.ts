import moment from 'moment';

// Определяем русскую локаль
moment.defineLocale('ru', {
    months: {
        format: 'января_февраля_марта_апреля_мая_июня_июля_августа_сентября_октября_ноября_декабря'.split('_'),
        standalone: 'январь_февраль_март_апрель_май_июнь_июль_август_сентябрь_октябрь_ноябрь_декабрь'.split('_'),
    },
    monthsShort: {
        format: 'янв._февр._мар._апр._мая_июня_июля_авг._сент._окт._нояб._дек.'.split('_'),
        standalone: 'янв._февр._март_апр._май_июнь_июль_авг._сент._окт._нояб._дек.'.split('_'),
    },
    weekdays: {
        standalone: 'воскресенье_понедельник_вторник_среда_четверг_пятница_суббота'.split('_'),
        format: 'воскресенье_понедельник_вторник_среду_четверг_пятницу_субботу'.split('_'),
        isFormat: /\[ ?[Вв] ?(?:прошлую|следующую|эту)? ?] ?dddd/,
    },
    weekdaysShort: 'вс_пн_вт_ср_чт_пт_сб'.split('_'),
    weekdaysMin: 'вс_пн_вт_ср_чт_пт_сб'.split('_'),
    monthsParseExact: true,
    longDateFormat: {
        LT: 'H:mm',
        LTS: 'H:mm:ss',
        L: 'DD.MM.YYYY',
        LL: 'D MMMM YYYY г.',
        LLL: 'D MMMM YYYY г., H:mm',
        LLLL: 'dddd, D MMMM YYYY г., H:mm',
    },
    calendar: {
        sameDay: '[Сегодня, в] LT',
        nextDay: '[Завтра, в] LT',
        lastDay: '[Вчера, в] LT',
        nextWeek: '[В] dddd, [в] LT',
        lastWeek: '[В прошлый] dddd, [в] LT',
        sameElse: 'L',
    },
    relativeTime: {
        future: 'через %s',
        past: '%s назад',
        s: 'несколько секунд',
        ss: '%d секунд',
        m: 'минуту',
        mm: '%d минут',
        h: 'час',
        hh: '%d часов',
        d: 'день',
        dd: '%d дней',
        w: 'неделю',
        ww: '%d недель',
        M: 'месяц',
        MM: '%d месяцев',
        y: 'год',
        yy: '%d лет',
    },
    meridiemParse: /ночи|утра|дня|вечера/i,
    isPM: function (input) {
        return /^(дня|вечера)$/.test(input);
    },
    meridiem: function (hour) {
        if (hour < 4) return 'ночи';
        if (hour < 12) return 'утра';
        if (hour < 17) return 'дня';
        return 'вечера';
    },
    dayOfMonthOrdinalParse: /\d{1,2}-(й|го|я)/,
    ordinal: function (n: number): string {
        return n + '-й';
    },
    week: {
        dow: 1, // Понедельник - первый день недели
        doy: 4, // Неделя с 4 января - первая неделя года
    },
});

moment.locale('ru');

export default moment;
export type { Moment } from 'moment';
