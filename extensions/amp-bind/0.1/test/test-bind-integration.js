/**
 * Copyright 2017 The AMP HTML Authors. All Rights Reserved.
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

import '../../../amp-carousel/0.1/amp-carousel';
import {installBindForTesting} from '../bind-impl';
import {toggleExperiment} from '../../../../src/experiments';
import {createFixtureIframe} from '../../../../testing/iframe';
import {bindForDoc} from '../../../../src/bind';
import {ampdocServiceFor} from '../../../../src/ampdoc';

describe.configure().retryOnSaucelabs().run('integration amp-bind', function() {
  let fixture;
  let ampdoc;
  let bind;
  const fixtureLocation = 'test/fixtures/amp-bind-integrations.html';

  this.timeout(5000);

  beforeEach(() => {
    return createFixtureIframe(fixtureLocation).then(f => {
      fixture = f;
      toggleExperiment(fixture, 'amp-bind', true, true);
      return fixture.awaitEvent('amp:load:start', 1);
    }).then(() => {
      const ampdocService = ampdocServiceFor(fixture.win);
      ampdoc = ampdocService.getAmpDoc(fixture.doc);
      // Bind is installed manually here to get around an issue
      // toggling experiments on the iframe fixture.
      bind = installBindForTesting(ampdoc);
      return bind.initializePromiseForTesting();
    });
  });

  function waitForBindApplication() {
    // Bind should be available, but need to wait for actions to resolve
    // service promise for bind and call setState
    return bindForDoc(ampdoc).then(() => {
      return bind.setStatePromiseForTesting();
    });
  }

  describe('text integration', () => {
    it('should update text when text attribute binding changes', () => {
      const textElement = fixture.doc.getElementById('textElement');
      const button = fixture.doc.getElementById('mutateTextButton');
      expect(textElement.textContent).to.equal('unbound');
      button.click();
      return waitForBindApplication().then(() => {
        expect(textElement.textContent).to.equal('hello world');
      });
    });

    it('should update CSS class when class binding changes', () => {
      const textElement = fixture.doc.getElementById('textElement');
      const button = fixture.doc.getElementById('mutateTextButton');
      expect(textElement.className).to.equal('original');
      button.click();
      return waitForBindApplication().then(() => {
        expect(textElement.className).to.equal('new');
      });
    });
  });

  describe('amp-carousel integration', () => {
    it('should update dependent bindings on carousel slide changes', () => {
      const slideNum = fixture.doc.getElementById('slideNum');
      const carousel = fixture.doc.getElementById('carousel');
      const impl = carousel.implementation_;
      expect(slideNum.textContent).to.equal('0');
      impl.go(1, /* animate */ false);
      return waitForBindApplication().then(() => {
        expect(slideNum.textContent).to.equal('1');
      });
    });

    it('should change slides when the slide attribute binding changes', () => {
      const carousel = fixture.doc.getElementById('carousel');
      const goToSlide1Button = fixture.doc.getElementById('goToSlide1Button');
      const impl = carousel.implementation_;
      // No previous slide as current slide is 0th side
      expect(impl.hasPrev()).to.be.false;
      goToSlide1Button.click();
      return waitForBindApplication().then(() => {
        // Has previous slide since the index has changed
        expect(impl.hasPrev()).to.be.true;
      });
    });
  });

  describe('amp-live-list integration', () => {

    function createFromServer(childAttrs = []) {
      const parent = document.createElement('div');
      const itemsCont = document.createElement('div');
      itemsCont.setAttribute('items', '');
      parent.appendChild(itemsCont);
      for (let i = 0; i < childAttrs.length; i++) {
        const childAttr = childAttrs[i];
        const child = document.createElement('div');
        child.setAttribute('id', `${childAttr.id}`);
        child.setAttribute('data-sort-time',
            `${childAttr.sortTime || Date.now()}`);
        if ('updateTime' in childAttr) {
          child.setAttribute('data-update-time', `${childAttr.updateTime}`);
        }
        if ('tombstone' in childAttr) {
          child.setAttribute('data-tombstone', '');
        }
        child.innerHTML = '<p [text]="liveListText">unbound</p>';
        itemsCont.appendChild(child);
      }
      return parent;
    }

    it('should detect bindings in initial live-list elements', () => {
      const liveList = fixture.doc.getElementById('liveList');
      const liveListItems = fixture.doc.getElementById('liveListItems');
      expect(liveListItems.children.length).to.equal(1);

      const liveListItem1 = fixture.doc.getElementById('liveListItem1');
      expect(liveListItem1.firstElementChild.textContent).to.equal('unbound');

      const button = fixture.doc.getElementById('changeLiveListTextButton');
      button.click();
      return waitForBindApplication().then(() => {
        expect(liveListItem1.firstElementChild.textContent).to
            .equal('hello world');
      });
    });

    it('should apply scope to bindings in new list elements', () => {
      const liveList = fixture.doc.getElementById('liveList');
      const liveListItems = fixture.doc.getElementById('liveListItems');
      expect(liveListItems.children.length).to.equal(1);

      const liveListItem1 = fixture.doc.getElementById('liveListItem1');
      expect(liveListItem1.firstElementChild.textContent).to.equal('unbound');

      const impl = liveList.implementation_;
      const update = createFromServer([{id: 'liveListItem2'}]);
      impl.update(update);
      fixture.doc.getElementById('liveListUpdateButton').click();

      let liveListItem2;
      return bind.waitForAllMutationsForTesting().then(() => {
        expect(liveListItems.children.length).to.equal(2);
        liveListItem2 = fixture.doc.getElementById('liveListItem2');
        fixture.doc.getElementById('changeLiveListTextButton').click();
        return waitForBindApplication();
      }).then(() => {
        expect(liveListItem1.firstElementChild.textContent).to
            .equal('hello world');
        expect(liveListItem2.firstElementChild.textContent).to
            .equal('hello world');
      });
    });
  });


});
