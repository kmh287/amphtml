/**
 * Copyright 2016 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {BindExpression} from './bind-expression';
import {BindValidator} from './bind-validator';

/**
 * @typedef {{
 *   tagName: string,
 *   property: string,
 *   expressionString: string,
 * }}
 */
export let BindingDef;

/**
 * @typedef {{
 *   tagName: string,
 *   property: string,
 *   expression: !BindExpression,
 * }}
 */
let ParsedBindingDef;

/**
 * Asynchronously evaluates a set of Bind expressions.
 */
export class BindEvaluator {
  constructor() {
    /** @const {!Array<ParsedBindingDef>} */
    this.parsedBindings_ = [];

    /** @const {!./bind-validator.BindValidator} */
    this.validator_ = new BindValidator();
  }

  /**
   * Parses and stores given bindings into expression objects and returns map
   * of expression string to parse errors.
   * @param {!Array<BindingDef>} bindings
   * @return {!Object<string,string>}
   */
  setBindings(bindings) {
    const errors = Object.create(null);
    // Create BindExpression objects from expression strings.
    // TODO(choumx): Chunk creation of BindExpression or change to web worker.
    for (let i = 0; i < bindings.length; i++) {
      const e = bindings[i];
      const string = e.expressionString;

      let expression;
      try {
        expression = new BindExpression(e.expressionString);
      } catch (error) {
        errors[string] = error.message;
        continue;
      }

      this.parsedBindings_.push({
        tagName: e.tagName,
        property: e.property,
        expression,
      });
    }
    return errors;
  }

  /**
   * Evaluates all expressions with the given `scope` data returns two maps:
   * expression strings to results and expression strings to errors.
   * @param {!Object} scope
   * @return {{
   *   results: !Object<string, ./bind-expression.BindExpressionResultDef>,
   *   errors: !Object<string, !string>,
   * }}
   */
  evaluate(scope) {
    /** @type {!Object<string, ./bind-expression.BindExpressionResultDef>} */
    const cache = {};
    /** @type {!Object<string, string>} */
    const errors = {};

    this.parsedBindings_.forEach(binding => {
      const {tagName, property, expression} = binding;
      const expr = expression.expressionString;

      // Skip if we've already evaluated this expression string.
      if (cache[expr] !== undefined || errors[expr]) {
        return;
      }

      let result;
      try {
        result = binding.expression.evaluate(scope);
      } catch (error) {
        errors[expr] = error.message;
        return;
      }

      const resultString = this.stringValueOf_(property, result);
      if (this.validator_.isResultValid(tagName, property, resultString)) {
        cache[expr] = result;
      } else {
        errors[expr] = `"${result}" is not a valid result for [${property}].`;
      }
    });
    return {results: cache, errors};
  }

  /**
   * Returns the expression result string for a binding to `property`.
   * @param {./bind-expression.BindExpressionResultDef} result
   * @return {?string}
   * @private
   */
  stringValueOf_(property, result) {
    if (result === null) {
      return null;
    }
    switch (property) {
      case 'text':
        break;
      case 'class':
        if (Array.isArray(result)) {
          return result.join(' ');
        }
        break;
      default:
        if (typeof result === 'boolean') {
          return result ? '' : null;
        }
        break;
    }
    return String(result);
  }
}
