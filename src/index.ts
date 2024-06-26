export const executeExpression = (function (): (model: { [key: string]: any; }, expression: string | boolean) => boolean {
    const expressionCache: { [key: string]: any; } = {
        'true': () => true,
        'false': () => false
    };

    const equals = (value1: any, value2: any): boolean => {
        return value1 == value2;
    }

    const greaterThan = (value1: any, value2: any): boolean => {
        return value1 > value2;
    }

    const lessThan = (value1: any, value2: any): boolean => {
        return value1 < value2;
    }

    const contains = (value1: any, value2: any): boolean => {
        if (typeof value1 === 'string') {
            return value1.indexOf(value2) >= 0;
        }

        return false;
    }

    const not = (value: any): boolean => {
        return !value;
    }

    const or = (value1: any, value2: any): boolean => {
        return !!value1 || !!value2;
    }

    const and = (value1: any, value2: any): boolean => {
        return !!value1 && !!value2;
    }

    const empty = (value: any): boolean => {
        if (value === undefined || value === null) {
            return true;
        }

        if (typeof value === 'string' && value.length === 0) {
            return true;
        }

        return false;
    }
    const parseSingleBody = (value: any) => parseExpression(value.replace(/^\s*\(/, '').replace(/\)\s*$/, ''));

    const parseNot = (value: string): (model: { [key: string]: any; }) => boolean => {
        const inner = parseSingleBody(value);
        return (model) => not(inner(model));
    }

    const parseEmpty = (value: string): (model: { [key: string]: any; }) => boolean => {
        const inner = parseSingleBody(value);
        return (model) => empty(inner(model));
    }

    const resolveParameters = (value: string): { left: (model: { [key: string]: any; }) => boolean; right: (model: { [key: string]: any; }) => boolean } => {
        let bracketCount = 0;
        for (let i = 0; i < value.length; i++) {
            const character = value[i];
            switch (character) {
                case '(':
                    bracketCount++;
                    break;
                case ')':
                    bracketCount--;
                    break;

                case ',':
                    if (bracketCount === 1) {
                        const left = parseExpression(value.substring(1, i));
                        const right = parseExpression(value.substring(i + 1).replace(/\)?\s*$/, ''));

                        return { left, right };
                    }
                    break;
            }
        }
        throw new Error("Invalid Expression Part: " + value);
    }

    const parseEquals = (value: string): (model: { [key: string]: any; }) => boolean => {
        const parameters = resolveParameters(value);
        return (model) => equals(parameters.left(model), parameters.right(model));
    }

    const parseOr = (value: string): (model: { [key: string]: any; }) => boolean => {
        const parameters = resolveParameters(value);
        return (model) => or(parameters.left(model), parameters.right(model));
    }

    const parseAnd = (value: string): (model: { [key: string]: any; }) => boolean => {
        const parameters = resolveParameters(value);
        return (model) => and(parameters.left(model), parameters.right(model));
    }

    const parseContains = (value: string): (model: { [key: string]: any; }) => boolean => {
        const parameters = resolveParameters(value);
        return (model) => contains(parameters.left(model), parameters.right(model));
    }

    const parseGreaterThan = (value: string): (model: { [key: string]: any; }) => boolean => {
        const parameters = resolveParameters(value);
        return (model) => greaterThan(parameters.left(model), parameters.right(model));
    }

    const parseLessThan = (value: string): (model: { [key: string]: any; }) => boolean => {
        const parameters = resolveParameters(value);
        return (model) => lessThan(parameters.left(model), parameters.right(model));
    }

    const parseOperator = (operator: string, body: string): (model: { [key: string]: any; }) => boolean => {
        if (!operator) {
            throw new Error("Invalid Expression: no operator");
        }

        switch (operator.toLowerCase()) {
            case 'not':
                return parseNot(body);

            case 'eq':
                return parseEquals(body);

            case 'or':
                return parseOr(body);

            case 'and':
                return parseAnd(body);

            case 'contains':
                return parseContains(body);

            case 'gt':
                return parseGreaterThan(body);

            case 'lt':
                return parseLessThan(body);

            case 'empty':
                return parseEmpty(body);

            default:
                throw new Error("Invalid Operator: " + operator);
        }
    }

    const operatorRegex = /^\s*([a-zA-Z]+)\s*(\(.+?\))\s*$/;

    const parse = (value: string): (model: { [key: string]: any; }) => any => {
        switch (value.toLowerCase()) {
            case 'true':
                return () => true;
            case 'false':
                return () => false;
            default:
                const match = operatorRegex.exec(value);

                if (match) {
                    const operator: string = match[1];
                    const body: string = match[2];
                    return parseOperator(operator, body);
                }

                //return as constant since we didn't find an operator

                if (value.indexOf('#') === 0) {
                    value = value.substring(1);
                    return (model) => model[value];
                }

                const numericValue = parseFloat(value);
                if (isNaN(numericValue)) {
                    return () => value;
                }

                return () => numericValue;
        }
    }

    const parseExpression = (expression: string): (model: { [key: string]: any; }) => any => {
        expression = expression.trim();

        if (expression === '') {
            throw new Error("Invalid Expression: formatting");
        }

        const cachedExpression = expressionCache[expression];
        if (cachedExpression) {
            return cachedExpression;
        }

        const parsedResult = parse(expression);
        expressionCache[expression] = parsedResult;

        return parsedResult;
    }

    const flattenObject = (ob: any) => {
        var toReturn: any = {};

        for (var i in ob) {
            if (!ob.hasOwnProperty(i)) continue;

            if ((typeof ob[i]) == 'object' && ob[i] !== null) {
                var flatObject = flattenObject(ob[i]);
                for (var x in flatObject) {
                    if (!flatObject.hasOwnProperty(x)) continue;

                    toReturn[i + '.' + x] = flatObject[x];
                }
            } else {
                toReturn[i] = ob[i];
            }
        }
        return toReturn;
    }

    return (m, e) => {
        if (typeof e === 'boolean') {
            return e;
        }

        if (!(typeof e === 'string')) {
            throw new Error("Invalid Expression: unsupported type");
        }

        if (!e) {
            throw new Error("Invalid Expression: empty");
        }

        e = e.replace(/(\r\n|\n|\r)/gm, '');
        e = e.trim();

        if (!e) {
            throw new Error("Invalid Expression: whitespace");
        }

        if ((e.match(/\(/g) || []).length !== (e.match(/\)/g) || []).length) {
            throw new Error("Invalid Expression: unbalanced parenthesis");
        }

        if (e.indexOf('.') > 0) {
            m = flattenObject(m);
        }

        return parseExpression(e)(m);
    };
})();